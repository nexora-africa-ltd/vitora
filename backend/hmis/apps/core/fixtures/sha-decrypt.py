#!/usr/bin/env python
"""
SHA PII Decryption Utility

Decrypts encrypted _pii fields from DHA API responses using RSA/AES hybrid encryption.

Usage:
    # As Django management command context
    cd backend && poetry run python hmis/apps/core/fixtures/sha-decrypt.py '{"message": {...}}'

    # Pipe from curl
    curl -s "https://uat.dha.go.ke/v3/..." | poetry run python hmis/apps/core/fixtures/sha-decrypt.py

    # From file
    cat response.json | poetry run python hmis/apps/core/fixtures/sha-decrypt.py
"""
import base64
import json
import os
import sys

# Setup Django settings before importing anything else
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "hmis.settings.development")

# Add the backend directory to the path
backend_dir = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
)
sys.path.insert(0, backend_dir)

# Now we can import Django and crypto libraries
import django

django.setup()

from Crypto.Cipher import AES, PKCS1_OAEP
from Crypto.PublicKey import RSA
from Crypto.Util.Padding import unpad
from django.conf import settings


def get_private_key() -> str:
    """Load RSA private key from sha.pem file in backend directory."""
    pem_path = os.path.join(backend_dir, "sha.pem")

    if not os.path.exists(pem_path):
        raise FileNotFoundError(
            f"Private key file not found at {pem_path}\n"
            "Please create backend/sha.pem with your RSA private key."
        )

    with open(pem_path) as f:
        return f.read()


def get_agent() -> str:
    """Get DHA agent code from Django settings."""
    agent = getattr(settings, "SHA_AGENT", None)
    if not agent:
        raise ValueError(
            "SHA_AGENT not configured in Django settings.\n"
            "Set SHA_AGENT environment variable or add to your settings file."
        )
    return agent


# Function to decrypt AES key using RSA private key
def decrypt_with_rsa(private_key: str, encrypted_data: str) -> bytes:
    rsa_key = RSA.import_key(private_key)
    cipher = PKCS1_OAEP.new(rsa_key)
    decrypted_data = cipher.decrypt(base64.b64decode(encrypted_data))
    return base64.b64decode(decrypted_data)


# Function to decrypt AES-encrypted data
def decrypt_with_aes(encrypted_data: str, aes_key: bytes, iv: bytes) -> str:
    cipher = AES.new(aes_key, AES.MODE_CBC, iv)
    decrypted_data = unpad(cipher.decrypt(base64.b64decode(encrypted_data)), AES.block_size)
    return decrypted_data.decode()


# Main execution
def decrypt_pii(combined_base64: str, private_key: str) -> dict:
    """Decrypt a single _pii field."""
    # Split the combined base64 string to get encrypted AES key, IV, and JSON data
    combined_string = base64.b64decode(combined_base64).decode()
    encrypted_aes_key, encrypted_iv, encrypted_json_data = combined_string.split(":")

    # Decrypt the AES key and IV using the RSA private key
    aes_key = decrypt_with_rsa(private_key, encrypted_aes_key)
    iv = decrypt_with_rsa(private_key, encrypted_iv)

    # Decrypt the JSON data using the AES key and IV
    decrypted_json_data = decrypt_with_aes(encrypted_json_data, aes_key, iv)

    # Load the decrypted JSON data
    return json.loads(decrypted_json_data)


def main():
    # Load configuration
    try:
        private_key = get_private_key()
        agent = get_agent()
        print(f"Using DHA Agent: {agent}")
        print("Private key loaded from: backend/sha.pem\n")
    except (FileNotFoundError, ValueError) as e:
        print(f"Configuration Error: {e}", file=sys.stderr)
        sys.exit(1)

    if len(sys.argv) > 1:
        # Read from command line argument (JSON string)
        input_data = sys.argv[1]
    else:
        # Read from stdin
        input_data = sys.stdin.read()

    try:
        data = json.loads(input_data)

        # Handle the API response format: {"message": {"total": N, "result": [...]}}
        if "message" in data and "result" in data["message"]:
            results = data["message"]["result"]
            decrypted_results = []

            for i, item in enumerate(results):
                if "_pii" in item:
                    try:
                        decrypted = decrypt_pii(item["_pii"], private_key)
                        decrypted_results.append(decrypted)
                        print(f"\n=== Record {i+1} ===")
                        print(json.dumps(decrypted, indent=2))
                    except Exception as e:
                        print(f"\n=== Record {i+1} - ERROR ===")
                        print(f"Failed to decrypt: {e}")
                else:
                    decrypted_results.append(item)

            print(f"\n\n=== Summary: Decrypted {len(decrypted_results)} records ===")

        # Handle single _pii field
        elif "_pii" in data:
            decrypted = decrypt_pii(data["_pii"], private_key)
            print("Decrypted JSON Data:", json.dumps(decrypted, indent=2))

        else:
            print("No _pii field found in input")

    except json.JSONDecodeError as e:
        # Try treating input as raw base64 _pii value
        try:
            decrypted = decrypt_pii(input_data.strip(), private_key)
            print("Decrypted JSON Data:", json.dumps(decrypted, indent=2))
        except Exception as e2:
            print(f"Failed to parse input: {e}")
            print(f"Failed to decrypt as raw base64: {e2}")


if __name__ == "__main__":
    main()
