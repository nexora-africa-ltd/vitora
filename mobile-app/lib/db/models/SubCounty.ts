/**
 * SubCounty Model
 * 
 * WatermelonDB model for Kenya sub-counties (289 total).
 */

import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export class SubCounty extends Model {
  static table = 'sub_counties';

  @field('name') name!: string;
  @field('county_id') countyId!: string;
  @field('backend_id') backendId?: string;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}
