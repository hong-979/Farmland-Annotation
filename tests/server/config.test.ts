// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { loadServerConfig } from '../../server/config';

describe('server config', () => {
  it('defaults the host to 0.0.0.0 for LAN access', () => {
    expect(
      loadServerConfig({
        ANNOTATION_SERVER_PORT: '3001',
      }).host,
    ).toBe('0.0.0.0');
  });
});
