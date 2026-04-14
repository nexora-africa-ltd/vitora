import { z } from 'zod';

export const CountySchema = z.object({
  id: z.number(),
  code: z.number(),
  name: z.string(),
});

export const SubCountySchema = z.object({
  id: z.number(),
  county: z.number(),
  name: z.string(),
});

export const WardSchema = z.object({
  id: z.number(),
  sub_county: z.number(),
  name: z.string(),
});

export const CountyArraySchema = z.array(CountySchema);
export const SubCountyArraySchema = z.array(SubCountySchema);
export const WardArraySchema = z.array(WardSchema);
