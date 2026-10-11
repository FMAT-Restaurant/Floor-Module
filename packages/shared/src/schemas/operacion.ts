import { z } from 'zod';

export const healthDtoSchema = z.object({
  status: z.string(),
  db: z.string(),
  broker: z.string(),
});

export type HealthDto = z.infer<typeof healthDtoSchema>;
