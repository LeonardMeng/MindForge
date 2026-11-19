import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['**/dist/', '**/coverage/', '**/.mastery/'] },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // JS 文件（目前只有本配置文件）不在任何 tsconfig 里，关闭类型感知规则。
  { files: ['**/*.js'], extends: [tseslint.configs.disableTypeChecked] },
  // 放在最后：关掉和 Prettier 冲突的格式类规则。
  prettier,
);
