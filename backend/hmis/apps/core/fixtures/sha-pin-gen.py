#!/usr/bin/env python3
"""
SHA PIN Encryption Utility

Encrypts PINs using RSA-OAEP for SHA (Social Health Authority) Kenya API.
This is required for certain SHA API calls that require encrypted PIN transmission.

Usage:
    # Generate a secure random PIN and encrypt it
    python sha-pin-gen.py --generate

    # Encrypt a specific PIN (using default public key sha.pub)
    python sha-pin-gen.py 1234

    # Using a specific public key file
    python sha-pin-gen.py 1234 --key /path/to/public_key.pem

    # Using public key from environment variable
    SHA_PUBLIC_KEY_PATH=/path/to/key.pem python sha-pin-gen.py 1234

    # Output only the encrypted PIN (for scripting)
    python sha-pin-gen.py 1234 --quiet

    # Generate 6-digit PIN
    python sha-pin-gen.py --generate --digits 6

Reference:
    SHA API requires RSA-OAEP encryption with SHA-1 for MGF and hash algorithm.
"""

import argparse
import base64
import os
import secrets
import sys
from pathlib import Path

try:
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding
except ImportError:
    print("Error: cryptography package required. Install with: pip install cryptography")
    sys.exit(1)


# Default paths for public key
DEFAULT_KEY_PATHS = [
    Path(__file__).resolve().parent.parent.parent.parent.parent / "sha.pub",  # backend/sha.pub
    Path(__file__).resolve().parent / "sha.pub",  # Same directory
    Path.home() / ".sha" / "public_key.pem",  # User home
]


def generate_secure_pin(digits: int = 4) -> str:
    """
    Generate a cryptographically secure random PIN.

    Uses Python's `secrets` module which is suitable for security-sensitive
    applications like generating authentication tokens and PINs.

    Args:
        digits: Number of digits in the PIN (default: 4, max: 10)

    Returns:
        Zero-padded PIN string (e.g., "0042", "9381")

    Example:
        >>> pin = generate_secure_pin()  # "7392"
        >>> pin = generate_secure_pin(6)  # "029481"
    """
    if digits < 1 or digits > 10:
        raise ValueError("PIN must be between 1 and 10 digits")

    max_value = 10**digits
    pin_int = secrets.randbelow(max_value)
    return f"{pin_int:0{digits}d}"


def find_public_key() -> Path | None:
    """Find public key file from environment or default locations."""
    # Check environment variable first
    env_path = os.getenv("SHA_PUBLIC_KEY_PATH")
    if env_path:
        path = Path(env_path)
        if path.exists():
            return path
        print(f"Warning: SHA_PUBLIC_KEY_PATH set but file not found: {env_path}")

    # Check default locations
    for path in DEFAULT_KEY_PATHS:
        if path.exists():
            return path

    return None


def load_public_key(key_path: Path | None = None, key_pem: bytes | None = None):
    """
    Load RSA public key from file or PEM bytes.

    Args:
        key_path: Path to PEM public key file
        key_pem: PEM-encoded public key bytes

    Returns:
        RSA public key object

    Raises:
        ValueError: If no key provided or key is invalid
    """
    if key_pem:
        return serialization.load_pem_public_key(key_pem)

    if key_path:
        with open(key_path, "rb") as f:
            return serialization.load_pem_public_key(f.read())

    raise ValueError("No public key provided")


def encrypt_pin(pin: str, public_key) -> dict:
    """
    Encrypt a PIN using RSA-OAEP as required by SHA API.

    Args:
        pin: The PIN to encrypt (string)
        public_key: RSA public key object

    Returns:
        Dictionary with:
            - base64_ciphertext: Base64-encoded encrypted PIN
            - binary_ciphertext: Binary string representation (for debugging)
            - raw_bytes: Raw encrypted bytes (for advanced use)
    """
    # Encrypt using RSA-OAEP with SHA-1 (as specified by SHA API)
    ciphertext = public_key.encrypt(
        pin.encode("utf-8"),
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA1()), algorithm=hashes.SHA1(), label=None
        ),
    )

    # Base64 encode for API transmission
    base64_ciphertext = base64.b64encode(ciphertext).decode("utf-8")

    # Binary string representation (for debugging/verification)
    binary_ciphertext = "".join(format(byte, "08b") for byte in ciphertext)

    return {
        "base64_ciphertext": base64_ciphertext,
        "binary_ciphertext": binary_ciphertext,
        "raw_bytes": ciphertext,
    }


def encrypt_pin_simple(pin: str, key_path: Path | str | None = None) -> str:
    """
    Simple helper to encrypt a PIN and return base64 string.

    Args:
        pin: The PIN to encrypt
        key_path: Optional path to public key (uses default if not provided)

    Returns:
        Base64-encoded encrypted PIN string

    Example:
        >>> from hmis.apps.core.fixtures import sha_pin_gen
        >>> encrypted = sha_pin_gen.encrypt_pin_simple("1234")
        >>> print(encrypted)
    """
    if key_path is None:
        key_path = find_public_key()

    if key_path is None:
        raise FileNotFoundError(
            "No SHA public key found. Set SHA_PUBLIC_KEY_PATH environment variable "
            "or place sha.pub in backend/ directory."
        )

    if isinstance(key_path, str):
        key_path = Path(key_path)

    public_key = load_public_key(key_path=key_path)
    result = encrypt_pin(pin, public_key)
    return result["base64_ciphertext"]


def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Encrypt PINs for SHA (Social Health Authority) Kenya API",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    %(prog)s 1234                     # Encrypt PIN with default key
    %(prog)s --generate               # Generate secure PIN and encrypt
    %(prog)s --generate --digits 6    # Generate 6-digit PIN
    %(prog)s 1234 --key sha.pub       # Encrypt with specific key file
    %(prog)s 1234 -q                  # Output only encrypted PIN
    %(prog)s 1234 --verify            # Show additional verification info
    %(prog)s --generate -q            # Output: PIN,ENCRYPTED (for scripting)
        """,
    )
    parser.add_argument("pin", nargs="?", default=None, help="PIN to encrypt (or use --generate)")
    parser.add_argument(
        "-g",
        "--generate",
        action="store_true",
        help="Generate a cryptographically secure random PIN",
    )
    parser.add_argument(
        "-d",
        "--digits",
        type=int,
        default=4,
        help="Number of digits for generated PIN (default: 4)",
    )
    parser.add_argument("-k", "--key", type=Path, help="Path to RSA public key file (PEM format)")
    parser.add_argument(
        "-q",
        "--quiet",
        action="store_true",
        help="Output only the encrypted PIN (or PIN,ENCRYPTED if --generate)",
    )
    parser.add_argument(
        "-v", "--verify", action="store_true", help="Show additional verification information"
    )

    args = parser.parse_args()

    # Determine PIN (provided or generated)
    if args.generate:
        pin = generate_secure_pin(args.digits)
        generated = True
    elif args.pin:
        pin = args.pin
        generated = False
    else:
        parser.error("Either provide a PIN or use --generate")

    # Find or use provided key
    key_path = args.key or find_public_key()

    if key_path is None:
        print("Error: No public key found.", file=sys.stderr)
        print("", file=sys.stderr)
        print("Options:", file=sys.stderr)
        print("  1. Place sha.pub in backend/ directory", file=sys.stderr)
        print("  2. Set SHA_PUBLIC_KEY_PATH environment variable", file=sys.stderr)
        print("  3. Use --key flag to specify path", file=sys.stderr)
        sys.exit(1)

    if not key_path.exists():
        print(f"Error: Public key file not found: {key_path}", file=sys.stderr)
        sys.exit(1)

    try:
        public_key = load_public_key(key_path=key_path)
        result = encrypt_pin(pin, public_key)

        if args.quiet:
            if generated:
                # Output both PIN and encrypted for scripting: PIN,ENCRYPTED
                print(f"{pin},{result['base64_ciphertext']}")
            else:
                print(result["base64_ciphertext"])
        else:
            print("SHA PIN Encryption")
            print("=" * 50)
            if generated:
                print(f"Generated PIN: {pin} ({len(pin)} digits, cryptographically secure)")
            else:
                print(f"Input PIN: {'*' * len(pin)} ({len(pin)} digits)")
            print(f"Public Key: {key_path}")
            print("")
            print("Encrypted PIN (Base64):")
            print(f"{result['base64_ciphertext']}")

            if args.verify:
                print("")
                print("Verification Info:")
                print(f"  - Ciphertext length: {len(result['raw_bytes'])} bytes")
                print(f"  - Base64 length: {len(result['base64_ciphertext'])} chars")
                print("  - Algorithm: RSA-OAEP (SHA-1)")
                print("  - Random source: secrets.randbelow() (CSPRNG)" if generated else "")

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
