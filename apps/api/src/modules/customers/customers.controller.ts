import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { IsString, IsNotEmpty, MinLength, IsOptional } from 'class-validator';
import { SessionGuard } from '../../common/guards/session.guard';
import { Session } from '../../common/decorators/session.decorator';
import { SessionData } from '../../common/guards/session.guard';
import { CustomersService } from './customers.service';

class CustomerWelcomeDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name!: string;

  @IsString()
  @IsNotEmpty()
  cpf!: string;
}

class CustomerRecognizeDto {
  @IsString()
  @IsNotEmpty()
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
