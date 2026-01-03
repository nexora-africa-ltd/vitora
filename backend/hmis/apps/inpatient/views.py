"""
Views for the inpatient app.
"""

from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import get_client_ip

from .models import (
    Ward,
    Bed,
    AdmissionRecommendation,
    Admission,
    WardRound,
    NursingKardex,
    KardexShiftNote,
    KardexHandoverNote,
    ShiftHandover,
    Transfer,
    Discharge,
)
from .serializers import (
    WardSerializer,
    BedSerializer,
)


class WardViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for Ward model (read-only).
    
    Provides listing and detail views for wards with:
    - Real-time occupancy statistics
    - Bed availability tracking
    - Filtering by ward type
    - Search by name or code
    
    Endpoints:
    - GET /api/inpatient/wards/ - List all wards
    - GET /api/inpatient/wards/{id}/ - Ward detail
    - GET /api/inpatient/wards/{id}/beds/ - List beds in ward
    """
    
    queryset = Ward.objects.filter(is_active=True)
    serializer_class = WardSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['ward_type', 'is_active']
    search_fields = ['name', 'code']
    ordering_fields = ['name', 'code', 'ward_type', 'capacity']
    ordering = ['name']
    
    @action(detail=True, methods=['get'])
    def beds(self, request, pk=None):
        """
        List all beds for a specific ward.
        
        Query parameters:
        - status: Filter by bed status (AVAILABLE, OCCUPIED, MAINTENANCE, RESERVED)
        """
        ward = self.get_object()
        beds = Bed.objects.filter(ward=ward)
        
        # Filter by status if provided
        status_filter = request.query_params.get('status')
        if status_filter:
            beds = beds.filter(status=status_filter)
        
        # Paginate results
        page = self.paginate_queryset(beds)
        if page is not None:
            serializer = BedSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = BedSerializer(beds, many=True)
        return Response(serializer.data)


class BedViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Bed model.
    
    Provides CRUD operations for beds with:
    - Bed status management
    - Audit logging for status changes
    - Filtering by ward and status
    
    Endpoints:
    - GET /api/inpatient/beds/ - List all beds
    - GET /api/inpatient/beds/{id}/ - Bed detail
    - PATCH /api/inpatient/beds/{id}/ - Update bed status
    """
    
    queryset = Bed.objects.all()
    serializer_class = BedSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['ward', 'status']
    search_fields = ['bed_number']
    ordering_fields = ['bed_number', 'status', 'status_changed_at']
    ordering = ['bed_number']
    
    def perform_update(self, serializer):
        """Update bed and log status changes."""
        old_status = self.get_object().status
        instance = serializer.save(status_changed_by=self.request.user)
        
        # Log bed status update
        if instance.status != old_status:
            AuditLog.log(
                action='bed_status_update',
                user=self.request.user,
                resource_type='Bed',
                resource_id=instance.id,
                details={
                    'old_status': old_status,
                    'new_status': instance.status,
                    'notes': instance.notes,
                },
                ip_address=get_client_ip(self.request),
            )
