import 'reflect-metadata';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { AssistantModule } from './assistant.module';
import { AssistantService } from './assistant.service';

describe('Assistant LGPD boundary', () => {
  it('não possui fallback in-process capaz de executar erasure por tool-call', () => {
    expect(Object.getOwnPropertyNames(AssistantService.prototype)).not.toContain(
      'persistLgpdToolRequests',
    );
  });

  it('não injeta LgpdModule no grafo do assistente', () => {
    const imports =
      (Reflect.getMetadata(MODULE_METADATA.IMPORTS, AssistantModule) as
        | Array<{ name?: string }>
        | undefined) ?? [];
    expect(imports.map((entry) => entry?.name)).not.toContain('LgpdModule');
  });
});
