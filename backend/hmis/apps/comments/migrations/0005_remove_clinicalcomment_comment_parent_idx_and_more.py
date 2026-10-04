# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Remove redundant comment indexes with concurrent PostgreSQL DDL."""

from django.db import migrations
from hmis.apps.core.migration_operations import ConcurrentRemoveIndex


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("comments", "0004_clinicalcomment_origin_hub_id_and_more"),
    ]

    operations = [
        ConcurrentRemoveIndex(
            model_name="clinicalcomment",
            name="comment_parent_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="clinicalcomment",
            name="comment_author_idx",
        ),
        ConcurrentRemoveIndex(
            model_name="commentreaction",
            name="reaction_comment_idx",
        ),
    ]
