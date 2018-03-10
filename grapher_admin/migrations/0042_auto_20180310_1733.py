# -*- coding: utf-8 -*-
# Generated by Django 1.11 on 2018-03-10 17:33
from __future__ import unicode_literals

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('grapher_admin', '0041_auto_20180310_1732'),
    ]

    operations = [
        migrations.AlterField(
            model_name='dataset',
            name='subcategoryId',
            field=models.ForeignKey(blank=True, db_column='subcategoryId', null=True, on_delete=django.db.models.deletion.DO_NOTHING, to='grapher_admin.DatasetSubcategory'),
        ),
    ]
