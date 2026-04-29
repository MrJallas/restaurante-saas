import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import {
  IsString,
  IsNotEmpty,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { SessionGuard } from '../../common/guards/session.guard';
import { Session } from '../../common/decorators/session.decorator';
import { SessionData } from '../../common/guards/session.guard';
import { CustomersService } from './customers.service';

class CustomerWelcomeDto {
  // Bug-hunter encontrou HTTP 500 com nome de 10k chars (overflow no
  // VARCHAR do customers.name). Sem MaxLength a request passa do guard
  // e explode no DB. 120 e suficiente pra qualquer nome real br.
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  // CPF: aceitamos so digitos (11 chars exatos). O frontend envia clean
  // (sem mascara), entao Matches /^\d{11}$/. MaxLength 11 evita ataque
  // de payload gigante.
  @IsString()
  @IsNotEmpty()
  @MinLength(11)
  @MaxLength(11)
  @Matches(/^\d{11}$/, { message: 'cpf must be 11 digits' })
  cpf!: string;
}

class CustomerRecognizeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  recognitionToken!: string;
}

@Controller(':slug/customer')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post('welcome')
  @UseGuards(SessionGuard)
  async welcome(
    @Body() dto: CustomerWelcomeDto,
    @Session() session: SessionData,
  ) {
    const result = await this.customersService.welcome(
      dto.name,
      dto.cpf,
      session.sessionId,
    );

    return {
      customerId: result.customerId,
      name: result.name,
      recognitionToken: result.recognitionToken,
      isReturning: result.isReturning,
      totalVisits: result.totalVisits,
      lastVisitSummary: result.lastVisitSummary,
      visitId: result.visitId,
    };
  }

  @Post('recognize')
  @UseGuards(SessionGuard)
  async recognize(
    @Body() dto: CustomerRecognizeDto,
    @Session() session: SessionData,
  ) {
    return this.customersService.recognize(
      dto.recognitionToken,
      session.sessionId,
    );
  }
}
