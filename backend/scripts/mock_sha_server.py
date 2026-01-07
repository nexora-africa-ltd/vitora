#!/usr/bin/env python3
"""
SHA (Social Health Authority) Mock API Server

A Flask-based mock server that simulates Kenya's SHA API endpoints for:
- Member eligibility verification
- Claim submission
- Claim status tracking
- Pre-authorization requests

Usage:
    poetry run python scripts/mock_sha_server.py
    # or
    python scripts/mock_sha_server.py --port 8080

The server runs on http://localhost:8080 by default.

Configure your Django settings to use this mock server:
    SHA_API_BASE_URL = 'http://localhost:8080/v1'
"""

import argparse
import json
import logging
import random
import uuid
from datetime import datetime, timedelta
from functools import wraps

from flask import Flask, jsonify, request

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('sha_mock_server')

app = Flask(__name__)

# In-memory storage for submitted claims (simulates SHA database)
claims_store: dict = {}
preauth_store: dict = {}


# =============================================================================
# Helper Functions
# =============================================================================


def generate_sha_reference() -> str:
    """Generate a SHA-style reference number."""
    return f"SHA-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:8].upper()}"


def validate_api_key(f):
    """Decorator to validate API key in requests."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        api_key = request.headers.get('X-API-Key') or request.headers.get('Authorization')
        
        # In mock mode, accept any non-empty key or skip validation
        if not api_key and app.config.get('REQUIRE_AUTH', False):
            return jsonify({
                'error': 'unauthorized',
                'message': 'API key required',
            }), 401
        
        return f(*args, **kwargs)
    return decorated_function


def log_request():
    """Log incoming request details."""
    logger.info(f"{request.method} {request.path}")
    if request.json:
        logger.debug(f"Request body: {json.dumps(request.json, indent=2)}")


# =============================================================================
# Eligibility Endpoints
# =============================================================================


@app.route('/v1/eligibility/check', methods=['POST'])
@validate_api_key
def check_eligibility():
    """
    Check member eligibility for SHA coverage.
    
    Request Body:
        {
            "sha_number": "SHA-123456789",
            "national_id": "12345678",  # Optional
            "service_date": "2026-01-07"  # Optional
        }
    
    Response (200):
        {
            "eligible": true,
            "sha_number": "SHA-123456789",
            "member_name": "John Doe",
            "valid_from": "2026-01-01",
            "valid_until": "2026-12-31",
            "benefit_package": "STANDARD",
            "benefit_balance": 500000.00,
            "dependents_covered": 3,
            "employer": "Acme Corporation",
            "checked_at": "2026-01-07T10:30:00Z"
        }
    """
    log_request()
    
    data = request.json or {}
    sha_number = data.get('sha_number', '')
    
    # Simulate various eligibility scenarios based on SHA number patterns
    
    # Pattern: Ends with '0' = Expired membership
    if sha_number.endswith('0'):
        return jsonify({
            'eligible': False,
            'sha_number': sha_number,
            'reason': 'MEMBERSHIP_EXPIRED',
            'message': 'Membership expired on 2025-12-31',
            'valid_until': '2025-12-31',
            'checked_at': datetime.utcnow().isoformat() + 'Z',
        })
    
    # Pattern: Ends with '9' = Suspended membership
    if sha_number.endswith('9'):
        return jsonify({
            'eligible': False,
            'sha_number': sha_number,
            'reason': 'MEMBERSHIP_SUSPENDED',
            'message': 'Membership suspended due to non-payment',
            'suspension_date': '2025-11-01',
            'checked_at': datetime.utcnow().isoformat() + 'Z',
        })
    
    # Pattern: Ends with '8' = Benefit exhausted
    if sha_number.endswith('8'):
        return jsonify({
            'eligible': False,
            'sha_number': sha_number,
            'reason': 'BENEFIT_EXHAUSTED',
            'message': 'Annual benefit limit reached',
            'benefit_balance': 0.00,
            'benefit_limit': 500000.00,
            'checked_at': datetime.utcnow().isoformat() + 'Z',
        })
    
    # Pattern: Contains 'VIP' = Enhanced coverage
    if 'VIP' in sha_number.upper():
        return jsonify({
            'eligible': True,
            'sha_number': sha_number,
            'member_name': 'VIP Member',
            'valid_from': '2026-01-01',
            'valid_until': '2026-12-31',
            'benefit_package': 'ENHANCED',
            'benefit_balance': 2000000.00,
            'benefit_limit': 2000000.00,
            'dependents_covered': 5,
            'employer': 'VIP Enterprises',
            'checked_at': datetime.utcnow().isoformat() + 'Z',
        })
    
    # Default: Active standard membership
    return jsonify({
        'eligible': True,
        'sha_number': sha_number,
        'member_name': 'Test Member',
        'valid_from': '2026-01-01',
        'valid_until': '2026-12-31',
        'benefit_package': 'STANDARD',
        'benefit_balance': 500000.00,
        'benefit_limit': 500000.00,
        'dependents_covered': 3,
        'employer': 'Sample Employer Ltd',
        'checked_at': datetime.utcnow().isoformat() + 'Z',
    })


@app.route('/v1/eligibility/batch', methods=['POST'])
@validate_api_key
def batch_eligibility_check():
    """
    Check eligibility for multiple members at once.
    
    Request Body:
        {
            "members": [
                {"sha_number": "SHA-123456789"},
                {"sha_number": "SHA-987654321"}
            ]
        }
    """
    log_request()
    
    data = request.json or {}
    members = data.get('members', [])
    
    results = []
    for member in members[:50]:  # Limit to 50 per batch
        sha_number = member.get('sha_number', '')
        is_eligible = not sha_number.endswith(('0', '8', '9'))
        
        results.append({
            'sha_number': sha_number,
            'eligible': is_eligible,
            'checked_at': datetime.utcnow().isoformat() + 'Z',
        })
    
    return jsonify({
        'results': results,
        'total_checked': len(results),
        'eligible_count': sum(1 for r in results if r['eligible']),
    })


# =============================================================================
# Claims Endpoints
# =============================================================================


@app.route('/v1/claims/submit', methods=['POST'])
@validate_api_key
def submit_claim():
    """
    Submit a claim to SHA for processing.
    
    Request Body (FHIR Bundle or simplified format):
        {
            "facility_code": "FAC001",
            "sha_number": "SHA-123456789",
            "claim_type": "outpatient",
            "service_date": "2026-01-07",
            "diagnosis_codes": ["J00", "J06.9"],
            "total_amount": 5000.00,
            "items": [
                {
                    "tariff_code": "OPD-001",
                    "description": "Consultation",
                    "quantity": 1,
                    "unit_price": 500.00,
                    "amount": 500.00
                }
            ],
            "attachments": []
        }
    
    Response (202 Accepted):
        {
            "status": "acknowledged",
            "claim_reference": "SHA-20260107-A1B2C3D4",
            "submitted_at": "2026-01-07T10:30:00Z",
            "message": "Claim received and queued for processing",
            "estimated_processing_time": "3-5 business days"
        }
    """
    log_request()
    
    data = request.json or {}
    
    # Generate unique claim reference
    claim_ref = generate_sha_reference()
    
    # Validate required fields
    sha_number = data.get('sha_number') or data.get('member', {}).get('sha_number')
    if not sha_number:
        return jsonify({
            'error': 'validation_error',
            'message': 'SHA member number is required',
            'field': 'sha_number',
        }), 400
    
    # Check if member is eligible (simulate rejection for certain patterns)
    if sha_number.endswith('0'):
        return jsonify({
            'error': 'ineligible_member',
            'message': 'Member is not eligible for coverage',
            'sha_number': sha_number,
        }), 400
    
    # Store claim in memory
    claims_store[claim_ref] = {
        'reference': claim_ref,
        'sha_number': sha_number,
        'facility_code': data.get('facility_code', 'UNKNOWN'),
        'claim_type': data.get('claim_type', 'outpatient'),
        'total_amount': data.get('total_amount', 0),
        'status': 'under_review',
        'submitted_at': datetime.utcnow().isoformat() + 'Z',
        'items': data.get('items', []),
        'history': [
            {
                'status': 'acknowledged',
                'timestamp': datetime.utcnow().isoformat() + 'Z',
                'message': 'Claim received',
            }
        ],
    }
    
    logger.info(f"Claim submitted: {claim_ref} for member {sha_number}")
    
    return jsonify({
        'status': 'acknowledged',
        'claim_reference': claim_ref,
        'submitted_at': datetime.utcnow().isoformat() + 'Z',
        'message': 'Claim received and queued for processing',
        'estimated_processing_time': '3-5 business days',
    }), 202


@app.route('/v1/claims/<claim_ref>/status', methods=['GET'])
@validate_api_key
def get_claim_status(claim_ref):
    """
    Get the current status of a submitted claim.
    
    Response (200):
        {
            "claim_reference": "SHA-20260107-A1B2C3D4",
            "status": "approved",
            "status_message": "Claim approved for payment",
            "claimed_amount": 5000.00,
            "approved_amount": 4500.00,
            "adjustment_reason": "Tariff rate adjustment",
            "submitted_at": "2026-01-07T10:30:00Z",
            "processed_at": "2026-01-10T14:00:00Z",
            "payment_reference": "PAY-20260115-XYZ",
            "payment_date": "2026-01-15"
        }
    """
    log_request()
    
    # Check if we have this claim in store
    if claim_ref in claims_store:
        claim = claims_store[claim_ref]
        
        # Simulate status progression based on time
        submitted = datetime.fromisoformat(claim['submitted_at'].replace('Z', ''))
        age_hours = (datetime.utcnow() - submitted).total_seconds() / 3600
        
        if age_hours < 1:
            status = 'under_review'
            status_message = 'Claim is being reviewed'
        elif age_hours < 24:
            status = 'processing'
            status_message = 'Claim is being processed'
        else:
            # Randomly approve or reject (80% approval rate)
            if random.random() < 0.8:
                status = 'approved'
                status_message = 'Claim approved for payment'
            else:
                status = 'rejected'
                status_message = 'Claim rejected: Documentation incomplete'
        
        claim['status'] = status
        
        response = {
            'claim_reference': claim_ref,
            'status': status,
            'status_message': status_message,
            'claimed_amount': claim['total_amount'],
            'submitted_at': claim['submitted_at'],
        }
        
        if status == 'approved':
            # Apply 10% adjustment
            approved_amount = claim['total_amount'] * 0.9
            response.update({
                'approved_amount': approved_amount,
                'adjustment_reason': 'Standard tariff rate adjustment',
                'processed_at': datetime.utcnow().isoformat() + 'Z',
                'payment_reference': f"PAY-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}",
                'expected_payment_date': (datetime.now() + timedelta(days=14)).strftime('%Y-%m-%d'),
            })
        elif status == 'rejected':
            response.update({
                'rejection_code': 'DOC_INCOMPLETE',
                'rejection_reason': 'Required attachments missing',
                'can_appeal': True,
                'appeal_deadline': (datetime.now() + timedelta(days=30)).strftime('%Y-%m-%d'),
            })
        
        return jsonify(response)
    
    # Unknown claim - simulate a generic response
    statuses = [
        ('under_review', 'Claim is under review'),
        ('approved', 'Claim approved for payment'),
        ('rejected', 'Claim rejected'),
        ('paid', 'Payment processed'),
    ]
    status, message = random.choice(statuses)
    
    return jsonify({
        'claim_reference': claim_ref,
        'status': status,
        'status_message': message,
        'claimed_amount': 5000.00,
        'approved_amount': 4500.00 if status in ('approved', 'paid') else None,
        'updated_at': datetime.utcnow().isoformat() + 'Z',
    })


@app.route('/v1/claims/<claim_ref>/history', methods=['GET'])
@validate_api_key
def get_claim_history(claim_ref):
    """Get the full status history of a claim."""
    log_request()
    
    if claim_ref in claims_store:
        claim = claims_store[claim_ref]
        return jsonify({
            'claim_reference': claim_ref,
            'history': claim.get('history', []),
        })
    
    # Generate mock history for unknown claims
    return jsonify({
        'claim_reference': claim_ref,
        'history': [
            {
                'status': 'acknowledged',
                'timestamp': (datetime.utcnow() - timedelta(days=5)).isoformat() + 'Z',
                'message': 'Claim received',
            },
            {
                'status': 'under_review',
                'timestamp': (datetime.utcnow() - timedelta(days=4)).isoformat() + 'Z',
                'message': 'Claim assigned for review',
            },
            {
                'status': 'approved',
                'timestamp': (datetime.utcnow() - timedelta(days=2)).isoformat() + 'Z',
                'message': 'Claim approved',
                'approved_amount': 4500.00,
            },
        ],
    })


@app.route('/v1/claims/batch-status', methods=['POST'])
@validate_api_key
def batch_claim_status():
    """Get status for multiple claims at once."""
    log_request()
    
    data = request.json or {}
    claim_refs = data.get('claim_references', [])
    
    results = []
    for ref in claim_refs[:100]:  # Limit to 100 per batch
        if ref in claims_store:
            claim = claims_store[ref]
            results.append({
                'claim_reference': ref,
                'status': claim['status'],
                'total_amount': claim['total_amount'],
            })
        else:
            results.append({
                'claim_reference': ref,
                'status': random.choice(['under_review', 'approved', 'rejected', 'paid']),
                'total_amount': random.randint(1000, 50000),
            })
    
    return jsonify({
        'results': results,
        'total': len(results),
    })


# =============================================================================
# Pre-Authorization Endpoints
# =============================================================================


@app.route('/v1/preauth/request', methods=['POST'])
@validate_api_key
def request_preauth():
    """
    Request pre-authorization for a planned procedure.
    
    Request Body:
        {
            "sha_number": "SHA-123456789",
            "procedure_code": "SURG-001",
            "diagnosis_codes": ["K35.80"],
            "estimated_cost": 150000.00,
            "scheduled_date": "2026-01-20",
            "clinical_notes": "Appendectomy required due to acute appendicitis"
        }
    """
    log_request()
    
    data = request.json or {}
    sha_number = data.get('sha_number', '')
    
    preauth_ref = f"PA-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
    
    # Simulate pre-auth decision
    estimated_cost = data.get('estimated_cost', 0)
    
    # Auto-approve if under 50000 KES
    if estimated_cost < 50000:
        decision = 'approved'
        approved_amount = estimated_cost
        message = 'Pre-authorization approved'
    # Require review for higher amounts
    elif estimated_cost < 200000:
        decision = 'pending_review'
        approved_amount = None
        message = 'Pre-authorization pending medical review'
    else:
        decision = 'pending_review'
        approved_amount = None
        message = 'Pre-authorization requires senior medical officer review'
    
    preauth_store[preauth_ref] = {
        'reference': preauth_ref,
        'sha_number': sha_number,
        'decision': decision,
        'estimated_cost': estimated_cost,
        'approved_amount': approved_amount,
        'created_at': datetime.utcnow().isoformat() + 'Z',
    }
    
    return jsonify({
        'preauth_reference': preauth_ref,
        'decision': decision,
        'approved_amount': approved_amount,
        'valid_until': (datetime.now() + timedelta(days=30)).strftime('%Y-%m-%d') if decision == 'approved' else None,
        'message': message,
        'created_at': datetime.utcnow().isoformat() + 'Z',
    }), 201 if decision == 'approved' else 202


@app.route('/v1/preauth/<preauth_ref>/status', methods=['GET'])
@validate_api_key
def get_preauth_status(preauth_ref):
    """Get pre-authorization status."""
    log_request()
    
    if preauth_ref in preauth_store:
        preauth = preauth_store[preauth_ref]
        return jsonify(preauth)
    
    return jsonify({
        'preauth_reference': preauth_ref,
        'decision': 'approved',
        'approved_amount': 100000.00,
        'valid_until': (datetime.now() + timedelta(days=30)).strftime('%Y-%m-%d'),
    })


# =============================================================================
# Tariff Endpoints
# =============================================================================


@app.route('/v1/tariffs', methods=['GET'])
@validate_api_key
def list_tariffs():
    """
    List available SHA tariff codes.
    
    Query Parameters:
        - category: Filter by category (consultation, procedure, lab, imaging, pharmacy)
        - search: Search tariff description
        - limit: Number of results (default 50)
        - offset: Pagination offset
    """
    log_request()
    
    category = request.args.get('category', '')
    search = request.args.get('search', '').lower()
    limit = min(int(request.args.get('limit', 50)), 100)
    offset = int(request.args.get('offset', 0))
    
    # Mock tariff data
    tariffs = [
        {'code': 'CONS-001', 'description': 'General Consultation', 'category': 'consultation', 'rate': 500.00},
        {'code': 'CONS-002', 'description': 'Specialist Consultation', 'category': 'consultation', 'rate': 1500.00},
        {'code': 'LAB-001', 'description': 'Complete Blood Count', 'category': 'lab', 'rate': 800.00},
        {'code': 'LAB-002', 'description': 'Urinalysis', 'category': 'lab', 'rate': 400.00},
        {'code': 'LAB-003', 'description': 'Blood Glucose', 'category': 'lab', 'rate': 300.00},
        {'code': 'IMG-001', 'description': 'Chest X-Ray', 'category': 'imaging', 'rate': 1500.00},
        {'code': 'IMG-002', 'description': 'Ultrasound Abdomen', 'category': 'imaging', 'rate': 3000.00},
        {'code': 'PROC-001', 'description': 'Wound Dressing', 'category': 'procedure', 'rate': 500.00},
        {'code': 'PROC-002', 'description': 'Minor Surgery', 'category': 'procedure', 'rate': 5000.00},
        {'code': 'PHARM-001', 'description': 'Paracetamol 500mg', 'category': 'pharmacy', 'rate': 50.00},
        {'code': 'PHARM-002', 'description': 'Amoxicillin 500mg', 'category': 'pharmacy', 'rate': 100.00},
    ]
    
    # Filter by category
    if category:
        tariffs = [t for t in tariffs if t['category'] == category]
    
    # Filter by search
    if search:
        tariffs = [t for t in tariffs if search in t['description'].lower() or search in t['code'].lower()]
    
    # Paginate
    paginated = tariffs[offset:offset + limit]
    
    return jsonify({
        'tariffs': paginated,
        'total': len(tariffs),
        'limit': limit,
        'offset': offset,
    })


@app.route('/v1/tariffs/<code>', methods=['GET'])
@validate_api_key
def get_tariff(code):
    """Get details for a specific tariff code."""
    log_request()
    
    # Mock response
    return jsonify({
        'code': code,
        'description': f'Service for {code}',
        'category': 'general',
        'rate': 1000.00,
        'effective_from': '2026-01-01',
        'effective_until': '2026-12-31',
        'requires_preauth': code.startswith('PROC'),
    })


# =============================================================================
# Health Check & Admin Endpoints
# =============================================================================


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({
        'status': 'healthy',
        'service': 'SHA Mock API',
        'version': '1.0.0',
        'timestamp': datetime.utcnow().isoformat() + 'Z',
    })


@app.route('/v1/stats', methods=['GET'])
def get_stats():
    """Get mock server statistics (for debugging)."""
    return jsonify({
        'claims_submitted': len(claims_store),
        'preauths_requested': len(preauth_store),
        'uptime': 'N/A',
    })


@app.route('/v1/reset', methods=['POST'])
def reset_store():
    """Reset in-memory stores (for testing)."""
    global claims_store, preauth_store
    claims_store = {}
    preauth_store = {}
    
    logger.info("Mock server data reset")
    
    return jsonify({
        'status': 'reset',
        'message': 'All mock data cleared',
    })


# =============================================================================
# Error Handlers
# =============================================================================


@app.errorhandler(400)
def bad_request(error):
    return jsonify({
        'error': 'bad_request',
        'message': str(error),
    }), 400


@app.errorhandler(404)
def not_found(error):
    return jsonify({
        'error': 'not_found',
        'message': 'The requested resource was not found',
    }), 404


@app.errorhandler(500)
def internal_error(error):
    logger.error(f"Internal error: {error}")
    return jsonify({
        'error': 'internal_error',
        'message': 'An internal error occurred',
    }), 500


# =============================================================================
# Main Entry Point
# =============================================================================


def main():
    parser = argparse.ArgumentParser(description='SHA Mock API Server')
    parser.add_argument('--host', default='0.0.0.0', help='Host to bind to')
    parser.add_argument('--port', type=int, default=8080, help='Port to listen on')
    parser.add_argument('--debug', action='store_true', help='Enable debug mode')
    parser.add_argument('--require-auth', action='store_true', help='Require API key authentication')
    
    args = parser.parse_args()
    
    app.config['REQUIRE_AUTH'] = args.require_auth
    
    print(f"""
╔══════════════════════════════════════════════════════════════════╗
║                    SHA Mock API Server                           ║
╠══════════════════════════════════════════════════════════════════╣
║  Running on: http://{args.host}:{args.port}                            ║
║  Health check: http://{args.host}:{args.port}/health                   ║
║  Debug mode: {str(args.debug).ljust(50)}║
║  Auth required: {str(args.require_auth).ljust(47)}║
╠══════════════════════════════════════════════════════════════════╣
║  Endpoints:                                                      ║
║    POST /v1/eligibility/check      - Check member eligibility    ║
║    POST /v1/eligibility/batch      - Batch eligibility check     ║
║    POST /v1/claims/submit          - Submit a claim              ║
║    GET  /v1/claims/<ref>/status    - Get claim status            ║
║    GET  /v1/claims/<ref>/history   - Get claim history           ║
║    POST /v1/claims/batch-status    - Batch claim status          ║
║    POST /v1/preauth/request        - Request pre-authorization   ║
║    GET  /v1/preauth/<ref>/status   - Get pre-auth status         ║
║    GET  /v1/tariffs                - List tariff codes           ║
║    GET  /v1/tariffs/<code>         - Get tariff details          ║
╚══════════════════════════════════════════════════════════════════╝
    """)
    
    app.run(host=args.host, port=args.port, debug=args.debug)


if __name__ == '__main__':
    main()
