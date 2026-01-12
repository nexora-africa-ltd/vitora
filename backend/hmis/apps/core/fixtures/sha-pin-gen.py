from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import padding
    from cryptography.hazmat.primitives import hashes
    import base64
    
    
    def encrypt_and_encode(message, public_key_pem):
       """
       Encrypts a PIN using RSA with the provided public key,
       converts the encrypted data to a binary string, and base64 encodes it.
       :param message: The plaintext message to encrypt (string)
       :param public_key_pem: The public key in PEM format (bytes)
       :return: A dictionary with base64 encoded ciphertext
       """
       # Load the public key
       public_key = serialization.load_pem_public_key(public_key_pem)
    
    
       # Encrypt the message
       ciphertext = public_key.encrypt(
           message.encode('utf-8'),
           padding.OAEP(
               mgf=padding.MGF1(algorithm=hashes.SHA1()),
               algorithm=hashes.SHA1(),
               label=None
           )
       )
    
    
       # Convert encrypted data to binary string
       binary_ciphertext = ''.join(format(byte, '08b') for byte in ciphertext)
    
    
       # Base64 encode the ciphertext
       base64_ciphertext = base64.b64encode(ciphertext).decode('utf-8')
    
    
       return {
           'base64_ciphertext': base64_ciphertext
       }
    
    
    # Example usage
    sample_public_key_pem = b"""-----BEGIN PUBLIC KEY-----
    MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwvrZEM8Y2hB60oLYwPab
    4JDfu6eO3G6yMok7to/5YELif/X/f4c0dxb/mP+1+upQbK8OP41aFmk0cxlAEUhO
    +3DYqIo8J6w9fFHItcSr3K0xxBrs5Vck6cm1rpRjXqo/n+xq9IAuPmb1kbAU7Mgc
    loTQgvlQYpybru69f2lFSY1Z3T7l/qgUcYT66fp3FYXiBupUWKPEtHxj5P7NQrAe
    XwXSM7xIDHxmfXhBdliEar7i/NZ9ob8jSwJ1Ul2pZW3vmjAoDsJvlV0D7arJ5bhd
    JK9vxiX+UWtRBiT+HEOmIUWiru97szHBSHp7ib8QzsrKCsRDfGgvjFhe/KNheh+r
    bwIDAQAB
    -----END PUBLIC KEY-----"""
    sample_pin = "1234"
    result = encrypt_and_encode(sample_pin, sample_public_key_pem)
    print("Base64 encoded ciphertext:", result['base64_ciphertext'])