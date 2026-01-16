"""
Local WHO ICD-11 API Service for Vitora HMIS.

This module provides integration with a locally deployed WHO ICD-11 API
container (whoicd/icd-api) for standardized disease classification.

The local deployment avoids authentication issues with external APIs
and provides faster response times.

Docker setup: backend/compose.yml
API docs: https://icd.who.int/icdapi
"""

import logging
import re
from dataclasses import dataclass

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


@dataclass
class ICD11Code:
    """ICD-11 code data structure."""

    code: str
    title: str
    entity_id: str
    chapter: str | None = None
    browser_url: str | None = None
    is_leaf: bool = False

    def to_dict(self) -> dict:
        """Convert to dictionary for serialization."""
        return {
            'code': self.code,
            'title': self.title,
            'entity_id': self.entity_id,
            'chapter': self.chapter,
            'browser_url': self.browser_url,
            'is_leaf': self.is_leaf,
        }


class ICD11LocalService:
    """
    Service for querying the local WHO ICD-11 API.

    Uses the whoicd/icd-api Docker container running locally.
    Default URL: http://localhost:5080

    Example:
        >>> service = ICD11LocalService()
        >>> results = service.search('malaria')
        >>> for code in results:
        ...     print(f"{code.code}: {code.title}")
    """

    def __init__(self):
        """Initialize with local API URL from settings."""
        self.base_url = getattr(
            settings,
            'ICD11_LOCAL_API_URL',
            'http://localhost:5080'
        ).rstrip('/')
        self.timeout = getattr(settings, 'ICD11_API_TIMEOUT', 10)
        self.api_version = 'v2'
        self.language = 'en'

    def _get_headers(self) -> dict:
        """Get required headers for WHO ICD-11 API."""
        return {
            'API-Version': self.api_version,
            'Accept-Language': self.language,
            'Accept': 'application/json',
        }

    def _strip_html(self, text: str) -> str:
        """Remove HTML tags from text (e.g., <em class='found'>)."""
        return re.sub(r'<[^>]+>', '', text)

    def _extract_code_from_url(self, url: str) -> str | None:
        """Extract ICD-11 code from entity URL by fetching the entity."""
        # The code is not in the URL, we need to fetch the entity
        # For performance, we'll return None and let the caller fetch if needed
        return None

    def search(
        self,
        query: str,
        limit: int = 50,
        use_flexisearch: bool = True,
    ) -> list[ICD11Code]:
        """
        Search for ICD-11 codes by text query.

        Args:
            query: Search text (e.g., 'malaria', 'diabetes')
            limit: Maximum number of results (default 50)
            use_flexisearch: Use flexible search matching (default True)

        Returns:
            List of ICD11Code objects
        """
        if not query or len(query) < 2:
            return []

        try:
            # Use the search endpoint
            params = {
                'q': query,
                'subtreeFilterUsesFoundationDescendants': 'false',
                'includeKeywordResult': 'true',
                'useFlexisearch': str(use_flexisearch).lower(),
                'flatResults': 'true',
                'highlightingEnabled': 'false',  # Disable HTML highlighting
            }

            response = requests.get(
                f"{self.base_url}/icd/entity/search",
                headers=self._get_headers(),
                params=params,
                timeout=self.timeout,
            )
            response.raise_for_status()
            data = response.json()

            results = []
            entities = data.get('destinationEntities', [])

            for entity in entities[:limit]:
                # Get the ICD code - need to fetch from linearization
                entity_id = entity.get('id', '')
                title = self._strip_html(entity.get('title', ''))
                chapter = entity.get('chapter', '')
                the_code = entity.get('theCode')  # May be null
                is_leaf = entity.get('isLeaf', False)

                # If no code, try to get from MMS linearization
                code = the_code
                browser_url = None

                if entity_id:
                    # Convert foundation URI to MMS URI for code lookup
                    entity_num = entity_id.split('/')[-1]
                    mms_url = f"{self.base_url}/icd/release/11/2025-01/mms/{entity_num}"

                    try:
                        mms_response = requests.get(
                            mms_url,
                            headers=self._get_headers(),
                            timeout=5,
                        )
                        if mms_response.status_code == 200:
                            mms_data = mms_response.json()
                            code = mms_data.get('code', code)
                            browser_url = mms_data.get('browserUrl')
                    except Exception:
                        pass  # Use what we have

                if not code:
                    # Skip entries without codes
                    continue

                results.append(ICD11Code(
                    code=code,
                    title=title,
                    entity_id=entity_id,
                    chapter=chapter,
                    browser_url=browser_url,
                    is_leaf=is_leaf,
                ))

            return results

        except requests.exceptions.RequestException as e:
            logger.error(f"ICD-11 local API request failed: {e}")
            return []
        except Exception as e:
            logger.error(f"ICD-11 local search error: {e}")
            return []

    def get_by_code(self, code: str) -> ICD11Code | None:
        """
        Get ICD-11 entity by code.

        Args:
            code: ICD-11 code (e.g., '1A00', '5A11')

        Returns:
            ICD11Code if found, None otherwise
        """
        try:
            # Search in MMS linearization by code
            response = requests.get(
                f"{self.base_url}/icd/release/11/2025-01/mms/codeinfo/{code}",
                headers=self._get_headers(),
                timeout=self.timeout,
            )

            if response.status_code == 404:
                return None

            response.raise_for_status()
            data = response.json()

            # Get the stem entity for full details
            stem_id = data.get('stemId', '')

            return ICD11Code(
                code=code,
                title=data.get('title', {}).get('@value', ''),
                entity_id=stem_id,
                browser_url=data.get('browserUrl'),
            )

        except requests.exceptions.RequestException as e:
            logger.error(f"ICD-11 local API request failed for code {code}: {e}")
            return None
        except Exception as e:
            logger.error(f"ICD-11 local get_by_code error: {e}")
            return None

    def is_available(self) -> bool:
        """Check if the local ICD-11 API is available."""
        try:
            response = requests.get(
                f"{self.base_url}/icd/entity",
                headers=self._get_headers(),
                timeout=5,
            )
            return response.status_code == 200
        except Exception:
            return False
