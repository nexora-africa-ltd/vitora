/**
 * Ward Model
 * 
 * WatermelonDB model for Kenya wards (1448 total).
 */

import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export class Ward extends Model {
  static table = 'wards';

  @field('name') name!: string;
  @field('sub_county_id') subCountyId!: string;
  @field('backend_id') backendId?: string;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}
