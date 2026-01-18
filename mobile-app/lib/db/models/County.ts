/**
 * County Model
 *
 * WatermelonDB model for Kenya counties (47 total).
 */

import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export class County extends Model {
  static table = 'counties';

  @field('code') code!: number; // 1-47
  @field('name') name!: string;
  @field('backend_id') backendId?: string;

  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}
