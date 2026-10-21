import { Injectable } from '@nestjs/common';

/** Reloj inyectable: permite fijar "ahora" en las pruebas sin tocar el reloj del sistema. */
@Injectable()
export class Reloj {
  ahora(): Date {
    return new Date();
  }
}
