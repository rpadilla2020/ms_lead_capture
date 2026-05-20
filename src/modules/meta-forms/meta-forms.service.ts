import {
  BadRequestException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MetaFormConfig } from '../../entities/meta-form-config.entity';
import { MetaPageConfig } from '../../entities/meta-page-config.entity';
import { CreateMetaFormConfigDto, UpdateMetaFormConfigDto } from './meta-forms.dto';

@Injectable()
export class MetaFormsService {
  constructor(
    @InjectRepository(MetaFormConfig)
    private readonly repo: Repository<MetaFormConfig>,
    @InjectRepository(MetaPageConfig)
    private readonly pageRepo: Repository<MetaPageConfig>,
  ) {}

  async create(dto: CreateMetaFormConfigDto, accountId: number): Promise<MetaFormConfig> {
    // Verificar que la página existe y pertenece al account
    const page = await this.pageRepo.findOne({
      where: { id: dto.page_config_id, account_id: accountId, is_active: true },
    });
    if (!page) throw new NotFoundException('Página de Facebook no encontrada o inactiva');

    // Verificar que no existe ya ese form en esa página
    const exists = await this.repo.findOne({
      where: { account_id: accountId, page_id: page.page_id, form_id: dto.form_id },
    });
    if (exists) throw new BadRequestException('Ya existe una configuración para ese formulario en esta página');

    const form = this.repo.create({
      account_id:         accountId,
      page_config_id:     dto.page_config_id,
      page_id:            page.page_id,
      form_id:            dto.form_id,
      form_name:          dto.form_name,
      target_pipeline_id: dto.target_pipeline_id,
      target_stage_id:    dto.target_stage_id,
      default_agent_id:   dto.default_agent_id ?? null,
      field_mapping:      dto.field_mapping    ?? null,
      is_active:          true,
    });

    return this.repo.save(form);
  }

  async findAll(accountId: number, pageConfigId?: string): Promise<MetaFormConfig[]> {
    const where: any = { account_id: accountId };
    if (pageConfigId) where.page_config_id = pageConfigId;
    return this.repo.find({
      where,
      order:    { created_at: 'DESC' },
      relations: ['page_config'],
    });
  }

  async findOne(id: string, accountId: number): Promise<MetaFormConfig> {
    const form = await this.repo.findOne({
      where:    { id, account_id: accountId },
      relations: ['page_config'],
    });
    if (!form) throw new NotFoundException('Configuración de formulario no encontrada');
    return form;
  }

  async update(id: string, dto: UpdateMetaFormConfigDto, accountId: number): Promise<MetaFormConfig> {
    await this.findOne(id, accountId);
    await this.repo.update(id, {
      ...(dto.form_name          !== undefined && { form_name:          dto.form_name }),
      ...(dto.target_pipeline_id !== undefined && { target_pipeline_id: dto.target_pipeline_id }),
      ...(dto.target_stage_id    !== undefined && { target_stage_id:    dto.target_stage_id }),
      ...(dto.default_agent_id   !== undefined && { default_agent_id:   dto.default_agent_id }),
      ...(dto.field_mapping      !== undefined && { field_mapping:      dto.field_mapping }),
      ...(dto.is_active          !== undefined && { is_active:          dto.is_active }),
    });
    return this.findOne(id, accountId);
  }

  async remove(id: string, accountId: number): Promise<void> {
    const form = await this.findOne(id, accountId);
    await this.repo.remove(form);
  }
}
