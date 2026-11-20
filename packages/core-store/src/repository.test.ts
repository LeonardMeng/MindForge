import { describeRepositoryContract } from '@mastery/core/contract';
import { MemoryFileSystem } from '@mastery/platform-memory';
import { createStore } from '@mastery/store';

import { createStoreRepository } from './index.js';
import { fileSeed } from './test-helpers.js';

describeRepositoryContract('store (core-store)', () => {
  const fs = new MemoryFileSystem();
  return {
    repository: createStoreRepository(createStore(fs)),
    seed: fileSeed(fs),
  };
});
