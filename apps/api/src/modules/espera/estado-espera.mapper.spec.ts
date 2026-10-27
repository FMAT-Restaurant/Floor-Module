import { EstadoEspera as EstadoEsperaPrisma } from '@prisma/client';
import { EstadoEspera } from '@floor/shared';
import { estadoEsperaAPrisma, estadoEsperaDesdePrisma } from './estado-espera.mapper';

describe('estado-espera.mapper', () => {
  it('convierte todos los valores de EstadoEspera entre Prisma y @floor/shared', () => {
    expect(estadoEsperaDesdePrisma(EstadoEsperaPrisma.En_espera)).toBe(EstadoEspera.EN_ESPERA);
    expect(estadoEsperaDesdePrisma(EstadoEsperaPrisma.Notificado)).toBe(EstadoEspera.NOTIFICADO);
    expect(estadoEsperaDesdePrisma(EstadoEsperaPrisma.Sentado)).toBe(EstadoEspera.SENTADO);
    expect(estadoEsperaDesdePrisma(EstadoEsperaPrisma.Cancelado)).toBe(EstadoEspera.CANCELADO);
    expect(estadoEsperaDesdePrisma('En espera')).toBe(EstadoEspera.EN_ESPERA);

    expect(estadoEsperaAPrisma(EstadoEspera.EN_ESPERA)).toBe(EstadoEsperaPrisma.En_espera);
    expect(estadoEsperaAPrisma(EstadoEspera.NOTIFICADO)).toBe(EstadoEsperaPrisma.Notificado);
    expect(estadoEsperaAPrisma(EstadoEspera.SENTADO)).toBe(EstadoEsperaPrisma.Sentado);
    expect(estadoEsperaAPrisma(EstadoEspera.CANCELADO)).toBe(EstadoEsperaPrisma.Cancelado);
  });
});
