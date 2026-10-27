/**
 * BE-008 · RN-20: ejecuta cada minuto la verificación de reservas próximas,
 * delegando en `ReservasService` la detección de reservas dentro de la ventana
 * de anticipación de 30 minutos y la emisión de sus alertas de forma idempotente.
 * Registra los errores mediante el logger para facilitar el diagnóstico de fallos.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReservasService } from './reservas.service';

@Injectable()
export class ReservasCron {
  private readonly logger = new Logger(ReservasCron.name);

  constructor(private readonly reservasService: ReservasService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async checkReservasProximas() {
    try {
      await this.reservasService.procesarAlertasProximas();
    } catch (error) {
      this.logger.error('Error al detectar reservas próximas', error);
    }
  }
}