import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import type { OwnerOpeningHours } from '@restaurant/shared-types';

/**
 * PATCH parcial. A validação cruzada (horários, geofence completo e timezone
 * IANA) acontece no service depois do merge com o estado persistido.
 */
export class UpdateOwnerEstablishmentSettingsDto {
  @IsISO8601()
  expectedUpdatedAt!: string;

  @IsOptional()
  @IsString()
  @Length(2, 200)
  restaurantName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @IsOptional()
  @IsIn(['BRL'])
  currency?: 'BRL';

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(30)
  serviceFeePercent?: number;

  @IsOptional()
  @IsBoolean()
  geofenceEnabled?: boolean;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-90)
  @Max(90)
  geofenceLatitude?: number | null;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-180)
  @Max(180)
  geofenceLongitude?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(3)
  @Max(1000)
  geofenceRadiusMeters?: number;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsObject()
  openingHours?: OwnerOpeningHours | null;
}
