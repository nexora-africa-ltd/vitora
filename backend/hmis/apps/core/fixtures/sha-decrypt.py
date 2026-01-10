import base64
import json

from Crypto.Cipher import AES
from Crypto.PublicKey import RSA
from Crypto.Util.Padding import unpad
from Crypto.Cipher import PKCS1_OAEP

# Your RSA private key (replace with your actual private key)
agent="DHABP05113"
production_private_key = """-----BEGIN PRIVATE KEY-----
Sample Private Key
-----END PRIVATE KEY-----"""

# Function to decrypt AES key using RSA private key
def decrypt_with_rsa(private_key, encrypted_data):
    rsa_key = RSA.import_key(private_key)
    cipher = PKCS1_OAEP.new(rsa_key)
    decrypted_data = cipher.decrypt(base64.b64decode(encrypted_data))
    return base64.b64decode(decrypted_data)

# Function to decrypt AES-encrypted data
def decrypt_with_aes(encrypted_data, aes_key, iv):
    cipher = AES.new(aes_key, AES.MODE_CBC, iv)
    decrypted_data = unpad(cipher.decrypt(base64.b64decode(encrypted_data)), AES.block_size)
    return decrypted_data.decode()

# Main execution
def main():
    # Combined base64 string from encryption
    combined_base64 = "sample PII"

    # Split the combined base64 string to get encrypted AES key, IV, and JSON data
    combined_string = base64.b64decode(combined_base64).decode()
    encrypted_aes_key, encrypted_iv, encrypted_json_data = combined_string.split(":")

    # Decrypt the AES key and IV using the RSA private key
    aes_key = decrypt_with_rsa(production_private_key, encrypted_aes_key)
    iv = decrypt_with_rsa(production_private_key, encrypted_iv)

    # Decrypt the JSON data using the AES key and IV
    decrypted_json_data = decrypt_with_aes(encrypted_json_data, aes_key, iv)

    # Load the decrypted JSON data
    data = json.loads(decrypted_json_data)

    # Output the decrypted JSON data
    print("Decrypted JSON Data:", json.dumps(data, indent=2))

if __name__ == "__main__":
    main()