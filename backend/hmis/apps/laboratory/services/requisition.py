"""
External Lab Requisition PDF Generator.

Generates PDF requisition forms for external lab referrals.
"""

from io import BytesIO
from typing import Dict

from django.conf import settings
from django.core.files.base import ContentFile
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

from hmis.apps.laboratory.models import LabOrder


class ExternalLabRequisition:
    """Generate PDF requisition for external lab orders."""
    
    def __init__(self, lab_order: LabOrder):
        """
        Initialize requisition generator.
        
        Args:
            lab_order: LabOrder instance (must be external type)
            
        Raises:
            ValueError: If order is not external type
        """
        if lab_order.order_type != 'EXTERNAL':
            raise ValueError("Requisition only for external orders")
        
        self.lab_order = lab_order
        self.patient = lab_order.patient
        self.encounter = lab_order.encounter
    
    def generate_pdf(self) -> BytesIO:
        """
        Generate PDF requisition form.
        
        Returns:
            BytesIO buffer containing PDF
        """
        pdf_buffer = BytesIO()
        doc = SimpleDocTemplate(pdf_buffer, pagesize=letter)
        
        # Build PDF content
        story = []
        styles = getSampleStyleSheet()
        
        # Add facility header
        story.extend(self._build_header(styles))
        story.append(Spacer(1, 0.3 * inch))
        
        # Add title
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=16,
            textColor=colors.HexColor('#1a5490'),
            alignment=TA_CENTER,
            spaceAfter=12
        )
        story.append(Paragraph("LABORATORY REQUISITION FORM", title_style))
        story.append(Spacer(1, 0.2 * inch))
        
        # Add requisition info
        story.extend(self._build_requisition_info(styles))
        story.append(Spacer(1, 0.2 * inch))
        
        # Add patient info
        story.extend(self._build_patient_info(styles))
        story.append(Spacer(1, 0.2 * inch))
        
        # Add clinical info
        story.extend(self._build_clinical_info(styles))
        story.append(Spacer(1, 0.2 * inch))
        
        # Add test details
        story.extend(self._build_test_info(styles))
        story.append(Spacer(1, 0.3 * inch))
        
        # Add signature section
        story.extend(self._build_signature_section(styles))
        
        # Build PDF
        doc.build(story)
        pdf_buffer.seek(0)
        
        return pdf_buffer
    
    def _build_context(self) -> Dict:
        """Build template context for requisition."""
        # Get first test from order items
        first_item = self.lab_order.items.first()
        test_name = first_item.test.name if first_item else ''
        test_code = first_item.test.code if first_item else ''
        
        context = {
            # Facility info
            'facility_name': getattr(settings, 'FACILITY_NAME', 'Vitora Health Facility'),
            'facility_address': getattr(settings, 'FACILITY_ADDRESS', ''),
            'facility_phone': getattr(settings, 'FACILITY_PHONE', ''),
            'facility_email': getattr(settings, 'FACILITY_EMAIL', ''),
            'facility_license': getattr(settings, 'FACILITY_LICENSE', ''),
            
            # Requisition info
            'requisition_number': self.lab_order.order_number,
            'requisition_date': self.lab_order.created_at,
            'priority': (
                self.lab_order.queue_entry.priority 
                if hasattr(self.lab_order, 'queue_entry') 
                else 'ROUTINE'
            ),
            
            # Patient info
            'patient_name': f"{self.patient.first_name} {self.patient.last_name}",
            'patient_mrn': self.patient.mrn,
            'patient_dob': self.patient.date_of_birth,
            'patient_age': self.patient.age if hasattr(self.patient, 'age') else None,
            'patient_gender': self.patient.get_gender_display(),
            'patient_phone': getattr(self.patient, 'phone_number', ''),
            
            # Clinical info
            'clinician_name': f"{self.encounter.clinician.first_name} {self.encounter.clinician.last_name}",
            'clinical_notes': self.lab_order.clinical_notes or '',
            
            # Test info
            'test_name': test_name,
            'test_code': test_code,
            'sample_type': self.lab_order.sample_type or '',
        }
        
        return context
    
    def _build_header(self, styles):
        """Build facility header."""
        elements = []
        context = self._build_context()
        
        # Facility name
        header_style = ParagraphStyle(
            'Header',
            parent=styles['Normal'],
            fontSize=14,
            textColor=colors.HexColor('#1a5490'),
            alignment=TA_CENTER,
            fontName='Helvetica-Bold'
        )
        elements.append(Paragraph(context['facility_name'], header_style))
        
        # Contact info
        contact_style = ParagraphStyle(
            'Contact',
            parent=styles['Normal'],
            fontSize=9,
            alignment=TA_CENTER
        )
        contact_text = f"{context['facility_address']}<br/>{context['facility_phone']} | {context['facility_email']}"
        elements.append(Paragraph(contact_text, contact_style))
        
        return elements
    
    def _build_requisition_info(self, styles):
        """Build requisition information section."""
        context = self._build_context()
        
        data = [
            ['Requisition Number:', context['requisition_number'], 'Date:', context['requisition_date'].strftime('%Y-%m-%d %H:%M')],
            ['Priority:', context['priority'], '', '']
        ]
        
        # Highlight STAT/URGENT
        priority_color = colors.red if context['priority'] == 'STAT' else (
            colors.orange if context['priority'] == 'URGENT' else colors.black
        )
        
        table = Table(data, colWidths=[1.5*inch, 2*inch, 1*inch, 2*inch])
        table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('TEXTCOLOR', (1, 1), (1, 1), priority_color),
            ('FONTNAME', (1, 1), (1, 1), 'Helvetica-Bold'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        
        return [table]
    
    def _build_patient_info(self, styles):
        """Build patient information section."""
        context = self._build_context()
        
        section_style = ParagraphStyle(
            'SectionHeader',
            parent=styles['Heading2'],
            fontSize=12,
            textColor=colors.HexColor('#1a5490'),
            spaceAfter=6
        )
        
        elements = [Paragraph("Patient Information", section_style)]
        
        data = [
            ['Name:', context['patient_name'], 'MRN:', context['patient_mrn']],
            ['Date of Birth:', str(context['patient_dob']), 'Gender:', context['patient_gender']],
            ['Phone:', context['patient_phone'], '', '']
        ]
        
        table = Table(data, colWidths=[1.5*inch, 2*inch, 1*inch, 2*inch])
        table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        
        elements.append(table)
        return elements
    
    def _build_clinical_info(self, styles):
        """Build clinical information section."""
        context = self._build_context()
        
        section_style = ParagraphStyle(
            'SectionHeader',
            parent=styles['Heading2'],
            fontSize=12,
            textColor=colors.HexColor('#1a5490'),
            spaceAfter=6
        )
        
        elements = [Paragraph("Clinical Information", section_style)]
        
        data = [
            ['Ordering Clinician:', context['clinician_name']],
            ['Clinical Notes:', context['clinical_notes']]
        ]
        
        table = Table(data, colWidths=[1.5*inch, 5*inch])
        table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ]))
        
        elements.append(table)
        return elements
    
    def _build_test_info(self, styles):
        """Build test information section."""
        context = self._build_context()
        
        section_style = ParagraphStyle(
            'SectionHeader',
            parent=styles['Heading2'],
            fontSize=12,
            textColor=colors.HexColor('#1a5490'),
            spaceAfter=6
        )
        
        elements = [Paragraph("Test Details", section_style)]
        
        data = [
            ['Test Name:', context['test_name']],
            ['Test Code:', context['test_code']],
            ['Sample Type:', context['sample_type']]
        ]
        
        table = Table(data, colWidths=[1.5*inch, 5*inch])
        table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        
        elements.append(table)
        return elements
    
    def _build_signature_section(self, styles):
        """Build signature section."""
        elements = []
        
        data = [
            ['Sample Collected By:', '_' * 30, 'Date/Time:', '_' * 20],
            ['Signature:', '', '', ''],
            ['', '', '', ''],
            ['Clinician Signature:', '_' * 30, 'Date:', '_' * 20]
        ]
        
        table = Table(data, colWidths=[1.5*inch, 2.5*inch, 1*inch, 2*inch])
        table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('VALIGN', (0, 0), (-1, -1), 'BOTTOM'),
        ]))
        
        elements.append(table)
        return elements
    
    def save_to_order(self) -> None:
        """Save generated PDF to lab order's requisition_pdf field."""
        pdf_buffer = self.generate_pdf()
        filename = f"requisition_{self.lab_order.order_number}.pdf"
        
        self.lab_order.requisition_pdf.save(
            filename,
            ContentFile(pdf_buffer.getvalue()),
            save=True
        )
