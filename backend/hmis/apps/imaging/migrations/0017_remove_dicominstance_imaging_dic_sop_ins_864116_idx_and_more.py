# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Remove redundant imaging indexes with concurrent PostgreSQL DDL."""

from django.db import migrations
from hmis.apps.core.migration_operations import ConcurrentRemoveIndex


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("imaging", "0016_remove_redundant_dicom_study_patient_index"),
    ]

    operations = [
        ConcurrentRemoveIndex(
            model_name="dicominstance",
            name="imaging_dic_sop_ins_864116_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="dicominstance",
            name="imaging_dic_series__5734bd_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="dicomseries",
            name="imaging_dic_series__7cd7bb_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="dicomseries",
            name="imaging_dic_study_i_e4441a_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="dicomstudy",
            name="imaging_dic_study_i_b427ab_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="dicomstudy",
            name="imaging_dic_accessi_90afe9_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="externalimagingorderrequest",
            name="imaging_ext_message_2e820d_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="externalimagingorderrequest",
            name="imaging_ext_placer__6a3ec2_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="imagingequipment",
            name="imaging_ima_ae_titl_72da7b_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="imagingequipment",
            name="imaging_ima_serial__1a8cbc_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="imagingorder",
            name="imaging_ima_order_n_64b94d_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="imagingorder",
            name="imaging_ima_patient_9e3d0b_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="imagingprocedure",
            name="imaging_ima_facilit_9668fd_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="radiologyreport",
            name="imaging_rad_report__618433_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="radiologyreport",
            name="imaging_rad_imaging_ef6763_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="radiologyreport",
            name="imaging_rad_reporte_363e0d_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="radiologyreport",
            name="imaging_rad_superse_750b23_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="studysharelink",
            name="imaging_stu_token_9018ca_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="studysharelink",
            name="imaging_stu_expires_6afa62_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="walkinimagingpatient",
            name="imaging_wal_registr_93bf2c_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="walkinimagingpatient",
            name="imaging_wal_nationa_5ff859_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="walkinimagingpatient",
            name="imaging_wal_phone_n_70baf0_idx",
        ),
    ]
