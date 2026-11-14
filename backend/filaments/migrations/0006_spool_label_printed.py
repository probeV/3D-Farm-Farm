# v2 TBD-18: 스풀마다 QR 라벨을 뽑았는지. 지금까지는 라벨이 없었으므로 전부 False

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('filaments', '0005_spool_number'),
    ]

    operations = [
        migrations.AddField(
            model_name='spool',
            name='label_printed',
            field=models.BooleanField(default=False, verbose_name='라벨 뽑음'),
        ),
    ]
