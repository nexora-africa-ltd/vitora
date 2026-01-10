import base64
import json

from Crypto.Cipher import AES
from Crypto.PublicKey import RSA
from Crypto.Util.Padding import unpad
from Crypto.Cipher import PKCS1_OAEP

# Your RSA private key (replace with your actual private key)
agent="DHABP05113"
production_private_key = """-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDsrl9AOLD+40Hk
kkmMl09CSNs1EjHtfGNjf/8qsp2whNbaMqay676xYz0z/p8fVxZmqDmQPo+N6a0v
8mvF7feesHzNVxqHFnasMsaJNYbJ61hiNwAg5YUsXAbvKKs0tHt06xbk5YOiVKq6
2tGfSpcwBztW/fvx44nC8+35Jj4KUpgs7COHi0kvvHatMMAojrCoLUx9r0EYq/Yw
IDjDE2mArSsHsiSxawc30z9klDYHYWMTTK4ydcH4Otf7VEgN8aBfkwft7MqQawTH
/h12kmensTBIkXfUG8jKR4eRNv+X9tlbzKcJhL74bxLQC/xGiQy+5uUkHvfoL2Bm
XLvUL019AgMBAAECggEAGCK7YDtdF/kJK1Zxp/khd4MiJi9/UOuvikzaCBAj6DAm
ZXo8fqAaF6Z6Q3byjMnJj9lq2VdP4KsU4qqoK+HVr7npWC/1lWizMbc8gMR+b3vk
96Bf49A+vDnRk9+ZVJbCb4yuY9Q15Wlt6ap5LZ3NJ3QtVx8vwJ3cBWSbqXMpaM2L
i2rOisbHWoBpVKk9ED0A518WWuOioEtbc8vLzspsr2+RtZkBOtiqCILhrrtqmarK
F+KzFLZ79eNGhaBm5EYXF7YVMo+xsk0rSBJmtuFWSV8F6Xpva8Hq7GrO8KdAIX45
cCAk0fv9PUw0yghfoJggBNKlt/X6g+lN3MMJn6oXvwKBgQD4oprMIs/2k6WkxFRW
PzkMlwB0UXOlBeHrcv4QLbLrCvR8XAuijMFjCEMWp+WR354Wp3zqlNMUdohq3fQx
XKjMgaiS8gdxg6ZdBFrPUoLJZyRz26MhiDhcZcgowK+loXew1UixnFehJMv4BxC2
eeuAw4/70sZdsVJN0f9OMNqegwKBgQDzsR7GERfCy36TdOOtPXgl/yjIIvafFUKz
Q1Uh47ingLlzAPeP+IA2Zxvh9r4hHCxkQMb5cBt0Kyz3zxAz1GRStZfI+1NRjhQz
A3XLSTIoHGc//BISxQ9t3GJIdWSzKpWlZlYB3uliZRCcBiezVzGmRh/AFZ7pmYND
DwJeUiqj/wKBgQDy2niSvcodkZewuWebGoPRrUhvVQO9A2LpBFfuW4SwGfI16f4f
Vpap8W7+GR6d/iq++/eCdb069pBGuecDs/rYTijm5uqoUKvVnSRJ7tD6gflUBQtw
/En4zh3U2Gh4Qp/TJHCtswTQzE1CRTxoz+tcySfBE95Xs5StmFlj+UoAmwKBgHdU
mFktLZF5zHWwm3zNyPPySqoWVOX5pzvZEOsTc+yyIB2sr42UhlQdkY3JIblc7m/5
OHYU65yrN83xW2HF84p82eLVDyu0gzenzhrJsQHrRrQSX1dJoBCQBqCsu67wf28K
+brYyTghfUypxu8PF4TwecO50qNZROmlg+dkHPVJAoGAa4bUU9gIUfNS0DhScdOn
Fxsw/dLtCOaDoyVqmk1WNM6GKz1MlGAU5wdI/72P5YtzfwFRIpLfbXXhscOUBcCH
i3OaJk8zEBDeyjzoDJcQtXiPoDYMdAJayXdXlZV78mPmQVXajFWK0j0XyIWQMOpa
UFx2ql+SG5nuWBfB8+2s6wM=
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
def decrypt_pii(combined_base64: str) -> dict:
    """Decrypt a single _pii field."""
    # Split the combined base64 string to get encrypted AES key, IV, and JSON data
    combined_string = base64.b64decode(combined_base64).decode()
    encrypted_aes_key, encrypted_iv, encrypted_json_data = combined_string.split(":")

    # Decrypt the AES key and IV using the RSA private key
    aes_key = decrypt_with_rsa(production_private_key, encrypted_aes_key)
    iv = decrypt_with_rsa(production_private_key, encrypted_iv)

    # Decrypt the JSON data using the AES key and IV
    decrypted_json_data = decrypt_with_aes(encrypted_json_data, aes_key, iv)

    # Load the decrypted JSON data
    return json.loads(decrypted_json_data)


def main():
    import sys
    
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
                        decrypted = decrypt_pii(item["_pii"])
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
            decrypted = decrypt_pii(data["_pii"])
            print("Decrypted JSON Data:", json.dumps(decrypted, indent=2))
        
        else:
            print("No _pii field found in input")
            
    except json.JSONDecodeError as e:
        # Try treating input as raw base64 _pii value
        try:
            decrypted = decrypt_pii(input_data.strip())
            print("Decrypted JSON Data:", json.dumps(decrypted, indent=2))
        except Exception as e2:
            print(f"Failed to parse input: {e}")
            print(f"Failed to decrypt as raw base64: {e2}")

if __name__ == "__main__":
    main()