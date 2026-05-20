import {
  IsNotEmpty, IsOptional, IsString, IsBoolean, IsObject,
} from 'class-validator';

export class CreateMetaFormConfigDto {
  @IsNotEmpty()
  @IsString()
  page_config_id: string;

  @IsNotEmpty()
  @IsString()
  form_id: string;

  @IsNotEmpty()
  @IsString()
  form_name: string;

  @IsNotEmpty()
  @IsString()
  target_pipeline_id: string;

  @IsNotEmpty()
  @IsString()
  target_stage_id: string;

  @IsOptional()
  @IsString()
  default_agent_id?: string;

  /**
   * Mapeo de campos Meta → campos Cereza.
   * Ej: { "full_name": "title", "email": "email", "phone_number": "phone" }
   */
  @IsOptional()
  @IsObject()
  field_mapping?: Record<string, string>;
}

export class UpdateMetaFormConfigDto {
  @IsOptional()
  @IsString()
  form_name?: string;

  @IsOptional()
  @IsString()
  target_pipeline_id?: string;

  @IsOptional()
  @IsString()
  target_stage_id?: string;

  @IsOptional()
  @IsString()
  default_agent_id?: string;

  @IsOptional()
  @IsObject()
  field_mapping?: Record<string, string>;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
