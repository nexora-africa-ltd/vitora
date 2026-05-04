"""
URL configuration for clinical comments.

Comments are nested under their parent resources:
- /api/encounters/{id}/comments/
- /api/lab/orders/{id}/comments/
- /api/pharmacy/prescriptions/{id}/comments/

These are registered directly in the main urls.py for clarity.
"""
