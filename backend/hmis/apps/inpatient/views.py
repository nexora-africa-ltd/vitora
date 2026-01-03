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
    AdmissionRecommendationSerializer,
    AdmissionSerializer,
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


class AdmissionRecommendationViewSet(viewsets.ModelViewSet):
    """
    ViewSet for AdmissionRecommendation model.
    
    Provides CRUD operations for admission recommendations with:
    - Workflow methods (accept, decline)
    - Filtering by status and urgency
    - Expiry tracking
    
    Endpoints:
    - GET /api/inpatient/admission-recommendations/ - List all recommendations
    - GET /api/inpatient/admission-recommendations/{id}/ - Recommendation detail
    - POST /api/inpatient/admission-recommendations/ - Create recommendation
    - POST /api/inpatient/admission-recommendations/{id}/accept/ - Accept recommendation
    - POST /api/inpatient/admission-recommendations/{id}/decline/ - Decline recommendation
    """
    
    queryset = AdmissionRecommendation.objects.all()
    serializer_class = AdmissionRecommendationSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'urgency', 'recommended_by', 'preferred_ward_type']
    search_fields = ['reason', 'provisional_diagnosis_text']
    ordering_fields = ['created_at', 'expires_at', 'urgency']
    ordering = ['-created_at']
    
    def perform_create(self, serializer):
        """Create recommendation and log action."""
        instance = serializer.save()
        
        # Log recommendation creation
        AuditLog.log(
            action='admission_recommendation_create',
            user=self.request.user,
            resource_type='AdmissionRecommendation',
            resource_id=instance.id,
            details={
                'encounter': instance.encounter.id,
                'urgency': instance.urgency,
                'reason': instance.reason,
            },
            ip_address=get_client_ip(self.request),
        )
    
    @action(detail=True, methods=['post'])
    def accept(self, request, pk=None):
        """
        Accept a pending admission recommendation.
        
        Request body:
        - user: User ID who is accepting
        """
        recommendation = self.get_object()
        user_id = request.data.get('user')
        
        if not user_id:
            return Response(
                {'error': 'User ID required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            user = User.objects.get(id=user_id)
            recommendation.accept(user)
            
            # Log acceptance
            AuditLog.log(
                action='admission_recommendation_accept',
                user=request.user,
                resource_type='AdmissionRecommendation',
                resource_id=recommendation.id,
                details={'accepted_by': user.username},
                ip_address=get_client_ip(request),
            )
            
            serializer = self.get_serializer(recommendation)
            return Response(serializer.data)
            
        except User.DoesNotExist:
            return Response(
                {'error': 'User not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def decline(self, request, pk=None):
        """
        Decline a pending admission recommendation.
        
        Request body:
        - user: User ID who is declining
        - reason: Reason for declining (required)
        """
        recommendation = self.get_object()
        user_id = request.data.get('user')
        reason = request.data.get('reason')
        
        if not user_id or not reason:
            return Response(
                {'error': 'User ID and reason required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            user = User.objects.get(id=user_id)
            recommendation.decline(user, reason)
            
            # Log decline
            AuditLog.log(
                action='admission_recommendation_decline',
                user=request.user,
                resource_type='AdmissionRecommendation',
                resource_id=recommendation.id,
                details={
                    'declined_by': user.username,
                    'reason': reason,
                },
                ip_address=get_client_ip(request),
            )
            
            serializer = self.get_serializer(recommendation)
            return Response(serializer.data)
            
        except User.DoesNotExist:
            return Response(
                {'error': 'User not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )


class AdmissionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Admission model.
    
    Provides CRUD operations for admissions with:
    - Auto-generated admission numbers
    - Bed status management
    - Length of stay tracking
    - Filtering by ward, status, patient
    
    Endpoints:
    - GET /api/inpatient/admissions/ - List all admissions
    - GET /api/inpatient/admissions/{id}/ - Admission detail
    - POST /api/inpatient/admissions/ - Create admission
    - PATCH /api/inpatient/admissions/{id}/ - Update admission
    """
    
    queryset = Admission.objects.all()
    serializer_class = AdmissionSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['patient', 'ward', 'admission_status', 'payer_type']
    search_fields = ['admission_number', 'patient__first_name', 'patient__last_name']
    ordering_fields = ['admission_date', 'created_at', 'admission_number']
    ordering = ['-admission_date']
    
    def perform_create(self, serializer):
        """Create admission and log action."""
        instance = serializer.save()
        
        # Log admission creation
        AuditLog.log(
            action='admission_create',
            user=self.request.user,
            resource_type='Admission',
            resource_id=instance.id,
            details={
                'admission_number': instance.admission_number,
                'patient': instance.patient.id,
                'ward': instance.ward.name,
                'bed': instance.bed.bed_number,
            },
            ip_address=get_client_ip(self.request),
        )
