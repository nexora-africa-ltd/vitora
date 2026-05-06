"""
L4: Microbiology Module — Culture & Sensitivity models.

Models for culture results, antibiotic sensitivity testing,
organism identification, and cumulative antibiogram generation.
"""

from django.contrib.auth import get_user_model
from django.db import models
from django.utils import timezone

from hmis.apps.core.mixins import FacilityScopedModel

User = get_user_model()


class Organism(models.Model):
    """Master list of organisms for culture results."""

    code = models.CharField(max_length=30, unique=True, help_text="WHONET organism code")
    name = models.CharField(max_length=200)
    genus = models.CharField(max_length=100, blank=True)
    species = models.CharField(max_length=100, blank=True)
    gram_stain = models.CharField(
        max_length=20,
        choices=[
            ("POSITIVE", "Gram Positive"),
            ("NEGATIVE", "Gram Negative"),
            ("VARIABLE", "Variable"),
            ("NA", "Not Applicable"),
        ],
        default="NA",
    )
    organism_type = models.CharField(
        max_length=20,
        choices=[
            ("BACTERIA", "Bacteria"),
            ("FUNGUS", "Fungus"),
            ("PARASITE", "Parasite"),
            ("VIRUS", "Virus"),
            ("MYCOBACTERIA", "Mycobacteria"),
            ("OTHER", "Other"),
        ],
        default="BACTERIA",
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Antibiotic(models.Model):
    """Master list of antibiotics for susceptibility testing."""

    code = models.CharField(
        max_length=20, unique=True, help_text="WHONET antibiotic code (e.g. AMP, GEN)"
    )
    name = models.CharField(max_length=200)
    antibiotic_class = models.CharField(
        max_length=100, blank=True, help_text="e.g. Penicillins, Aminoglycosides"
    )
    disk_content = models.CharField(max_length=50, blank=True, help_text="e.g. 10µg, 30µg")
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.code})"


class CultureResult(FacilityScopedModel):
    """Culture result linked to a lab result, tracking multi-step culture workflow."""

    class CultureStatus(models.TextChoices):
        INOCULATED = "INOCULATED", "Inoculated"
        INCUBATING = "INCUBATING", "Incubating"
        READING = "READING", "Reading"
        PRELIMINARY = "PRELIMINARY", "Preliminary"
        FINAL = "FINAL", "Final"
        NO_GROWTH = "NO_GROWTH", "No Growth"
        CANCELLED = "CANCELLED", "Cancelled"

    lab_result = models.OneToOneField(
        "laboratory.LabResult",
        on_delete=models.CASCADE,
        related_name="culture_result",
    )
    specimen = models.ForeignKey(
        "laboratory.Specimen",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="culture_results",
    )
    status = models.CharField(
        max_length=20,
        choices=CultureStatus.choices,
        default=CultureStatus.INOCULATED,
    )

    # Culture details
    culture_medium = models.CharField(
        max_length=100, blank=True, help_text="e.g. Blood Agar, MacConkey"
    )
    incubation_temperature = models.DecimalField(
        max_digits=4, decimal_places=1, null=True, blank=True, help_text="°C"
    )
    incubation_atmosphere = models.CharField(
        max_length=30,
        choices=[
            ("AEROBIC", "Aerobic"),
            ("ANAEROBIC", "Anaerobic"),
            ("CO2", "CO2 Enriched"),
            ("MICROAEROPHILIC", "Microaerophilic"),
        ],
        default="AEROBIC",
        blank=True,
    )
    incubation_hours = models.PositiveIntegerField(
        null=True, blank=True, help_text="Total incubation hours"
    )

    # Inoculation
    inoculated_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    inoculated_at = models.DateTimeField(null=True, blank=True)

    # Reading
    read_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    read_at = models.DateTimeField(null=True, blank=True)

    # Results
    colony_count = models.CharField(
        max_length=50, blank=True, help_text="e.g. >100,000 CFU/ml, Few, Moderate, Heavy"
    )
    morphology = models.TextField(blank=True, help_text="Colony morphology description")
    gram_stain_result = models.TextField(blank=True, help_text="Gram stain findings")
    microscopy_notes = models.TextField(blank=True, help_text="Direct microscopy findings")

    # Organism identification
    organism = models.ForeignKey(
        Organism, on_delete=models.SET_NULL, null=True, blank=True, related_name="culture_results"
    )
    identification_method = models.CharField(
        max_length=50,
        choices=[
            ("MANUAL", "Manual (Biochemical)"),
            ("VITEK", "VITEK Automated"),
            ("MALDI_TOF", "MALDI-TOF"),
            ("MOLECULAR", "Molecular (PCR)"),
            ("API", "API Strip"),
            ("OTHER", "Other"),
        ],
        default="MANUAL",
        blank=True,
    )

    # Preliminary / Final reporting
    preliminary_report = models.TextField(blank=True)
    preliminary_reported_at = models.DateTimeField(null=True, blank=True)
    final_report = models.TextField(blank=True)
    final_reported_at = models.DateTimeField(null=True, blank=True)

    # Clinical notes
    clinical_notes = models.TextField(blank=True, help_text="Notes for clinician")
    is_significant = models.BooleanField(
        default=True, help_text="Whether growth is clinically significant (vs contaminant)"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        org = self.organism.name if self.organism else "Pending"
        return f"Culture {self.pk} - {org} ({self.get_status_display()})"

    # Status transition methods
    def start_incubation(self, user=None, temperature=None, atmosphere=None, hours=None):
        self.status = self.CultureStatus.INCUBATING
        self.inoculated_by = user
        self.inoculated_at = timezone.now()
        if temperature:
            self.incubation_temperature = temperature
        if atmosphere:
            self.incubation_atmosphere = atmosphere
        if hours:
            self.incubation_hours = hours
        self.save()

    def start_reading(self, user=None):
        self.status = self.CultureStatus.READING
        self.read_by = user
        self.read_at = timezone.now()
        self.save()

    def report_preliminary(self, report_text):
        self.status = self.CultureStatus.PRELIMINARY
        self.preliminary_report = report_text
        self.preliminary_reported_at = timezone.now()
        self.save()

    def report_final(self, report_text=None):
        self.status = self.CultureStatus.FINAL
        if report_text:
            self.final_report = report_text
        self.final_reported_at = timezone.now()
        self.save()

    def mark_no_growth(self, user=None):
        self.status = self.CultureStatus.NO_GROWTH
        self.read_by = user
        self.read_at = timezone.now()
        self.is_significant = False
        self.save()

    def cancel(self):
        self.status = self.CultureStatus.CANCELLED
        self.save()

    @property
    def is_complete(self):
        return self.status in (self.CultureStatus.FINAL, self.CultureStatus.NO_GROWTH)

    @property
    def days_incubating(self):
        if self.inoculated_at:
            end = self.read_at or timezone.now()
            return (end - self.inoculated_at).days
        return None


class AntibioticSensitivity(FacilityScopedModel):
    """Antibiotic sensitivity/susceptibility result for a culture."""

    class Interpretation(models.TextChoices):
        SENSITIVE = "S", "Sensitive"
        INTERMEDIATE = "I", "Intermediate"
        RESISTANT = "R", "Resistant"

    class TestMethod(models.TextChoices):
        DISK_DIFFUSION = "DISK", "Disk Diffusion (Kirby-Bauer)"
        MIC_BROTH = "MIC_BROTH", "MIC (Broth Dilution)"
        MIC_ETEST = "MIC_ETEST", "MIC (E-test)"
        VITEK = "VITEK", "VITEK Automated"
        OTHER = "OTHER", "Other"

    culture = models.ForeignKey(
        CultureResult,
        on_delete=models.CASCADE,
        related_name="sensitivities",
    )
    antibiotic = models.ForeignKey(
        Antibiotic,
        on_delete=models.PROTECT,
        related_name="sensitivity_results",
    )

    # Disk diffusion result
    zone_diameter = models.DecimalField(
        max_digits=5, decimal_places=1, null=True, blank=True, help_text="Zone diameter in mm"
    )

    # MIC result
    mic = models.DecimalField(
        max_digits=8,
        decimal_places=3,
        null=True,
        blank=True,
        help_text="Minimum Inhibitory Concentration (µg/ml)",
    )

    # Interpretation
    interpretation = models.CharField(
        max_length=1,
        choices=Interpretation.choices,
    )

    # Method
    test_method = models.CharField(
        max_length=20,
        choices=TestMethod.choices,
        default=TestMethod.DISK_DIFFUSION,
    )

    # Breakpoints used
    breakpoint_standard = models.CharField(
        max_length=20,
        choices=[
            ("CLSI", "CLSI"),
            ("EUCAST", "EUCAST"),
            ("OTHER", "Other"),
        ],
        default="CLSI",
        blank=True,
    )

    # Metadata
    tested_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    tested_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["antibiotic__name"]
        unique_together = [("culture", "antibiotic")]
        verbose_name_plural = "Antibiotic sensitivities"

    def __str__(self):
        return f"{self.antibiotic.code}: {self.get_interpretation_display()}"


class Antibiogram(FacilityScopedModel):
    """Cumulative antibiogram — annual facility-level susceptibility statistics."""

    year = models.PositiveIntegerField()
    organism = models.ForeignKey(Organism, on_delete=models.CASCADE, related_name="antibiograms")
    antibiotic = models.ForeignKey(
        Antibiotic, on_delete=models.CASCADE, related_name="antibiograms"
    )
    total_isolates = models.PositiveIntegerField(default=0, help_text="Number of isolates tested")
    sensitive_count = models.PositiveIntegerField(default=0)
    intermediate_count = models.PositiveIntegerField(default=0)
    resistant_count = models.PositiveIntegerField(default=0)
    percent_sensitive = models.DecimalField(
        max_digits=5, decimal_places=1, null=True, blank=True, help_text="% susceptible"
    )
    percent_resistant = models.DecimalField(
        max_digits=5, decimal_places=1, null=True, blank=True, help_text="% resistant"
    )

    generated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-year", "organism__name", "antibiotic__name"]
        unique_together = [("facility", "year", "organism", "antibiotic")]

    def __str__(self):
        return f"{self.organism.name} vs {self.antibiotic.code} ({self.year}) - {self.percent_sensitive}%S"

    @classmethod
    def generate_for_facility(cls, facility, year):
        """Generate cumulative antibiogram from all final cultures for a facility/year."""
        from django.db.models import Count, Q

        sensitivities = (
            AntibioticSensitivity.objects.filter(
                culture__facility=facility,
                culture__status=CultureResult.CultureStatus.FINAL,
                culture__is_significant=True,
                culture__created_at__year=year,
            )
            .values("culture__organism", "antibiotic")
            .annotate(
                total=Count("id"),
                sensitive=Count("id", filter=Q(interpretation="S")),
                intermediate=Count("id", filter=Q(interpretation="I")),
                resistant=Count("id", filter=Q(interpretation="R")),
            )
        )

        results = []
        for row in sensitivities:
            if row["total"] < 1:
                continue
            obj, _ = cls.objects.update_or_create(
                facility=facility,
                organization=facility.organization,
                year=year,
                organism_id=row["culture__organism"],
                antibiotic_id=row["antibiotic"],
                defaults={
                    "total_isolates": row["total"],
                    "sensitive_count": row["sensitive"],
                    "intermediate_count": row["intermediate"],
                    "resistant_count": row["resistant"],
                    "percent_sensitive": round(row["sensitive"] / row["total"] * 100, 1)
                    if row["total"]
                    else None,
                    "percent_resistant": round(row["resistant"] / row["total"] * 100, 1)
                    if row["total"]
                    else None,
                },
            )
            results.append(obj)
        return results
