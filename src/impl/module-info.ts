import { promises as fs } from 'fs';
import path from 'path';
import type { FlatDts } from '../api';
import type { DtsSource } from './dts-source';

/**
 * @internal
 */
const noReferredLibs: ReadonlySet<string> = (/*#__PURE__*/ new Set());

/**
 * @internal
 */
export class ModuleInfo {

  static async main(source: DtsSource): Promise<ModuleInfo> {

    const { moduleName = await packageName() } = source.dtsOptions;

    return new ModuleInfo(
        source,
        moduleName,
        {
          file: source.source.fileName,
          libs: referredLibs(source, source.compilerOptions),
        },
    );
  }

  static external(source: DtsSource, name: string): ModuleInfo {
    return new ModuleInfo(source, name, 'external');
  }

  static internal(source: DtsSource, name: string): ModuleInfo {
    return new ModuleInfo(source, name, 'internal');
  }

  readonly isExternal: boolean;
  readonly isInternal: boolean;
  readonly file: string | undefined;
  private readonly _libs: ReadonlySet<string>;

  private constructor(
      readonly source: DtsSource,
      readonly declareAs: string,
      kind:
          | 'internal'
          | 'external'
          | {
              file: string;
              libs: ReadonlySet<string>;
          },
  ) {
    if (typeof kind === 'string') {
      this.isExternal = kind === 'external';
      this.isInternal = !this.isExternal;
      this.file = undefined;
      this._libs = noReferredLibs;
    } else {
      this.isExternal = false;
      this.isInternal = false;
      this.file = kind.file;
      this._libs = kind.libs;
    }
  }

  prelude(): string {

    let out = '';

    for (const lib of this._libs) {
      out += `/// <reference lib="${lib}" />${this.source.eol}`;
    }

    return out;
  }

  nested(name: string, desc: FlatDts.EntryDecl): ModuleInfo {

    let { as: declareAs = name } = desc;

    if (this.declareAs) {
      declareAs = `${this.declareAs}/${declareAs}`;
    }
    if (declareAs) {
      // Nested entry name.
      return new ModuleInfo(
          this.source,
          declareAs,
          {
            file: desc.file ?? this.file!,
            libs: referredLibs(this.source, desc, this._libs),
          },
      );
    }

    return this;
  }

  pathTo({ file: to }: ModuleInfo): string | undefined {

    const from = this.file;

    if (!from || !to || from === to) {
      return;
    }

    const relativePath = path.relative(path.dirname(from), to);

    return relativePath.split(path.sep).map(encodeURIComponent).join(path.sep);
  }

}

/**
 * @internal
 */
async function packageName(): Promise<string> {

  const packageJson = await fs.readFile('package.json', { encoding: 'utf-8' });
  const { name } = JSON.parse(packageJson) as { name?: string };

  if (!name) {
    throw new Error(
        'Can not detect module name automatically. '
        + 'Consider to set `flatDts({ moduleName: \'<MODULE>\' })` option explicitly',
    );
  }

  return name;
}

/**
 * @internal
 */
function referredLibs(
    source: DtsSource,
    { lib }: { lib?: FlatDts.Options['lib'] },
    defaultLibs = noReferredLibs,
): ReadonlySet<string> {
  if (lib === true) {
    lib = source.compilerOptions.lib;
  }
  if (lib == null) {
    return defaultLibs;
  }

  const result = new Set<string>();

  if (typeof lib === 'string') {
    result.add(referredLib(lib));
  } else if (lib !== false) {
    for (const name of lib) {
      result.add(referredLib(name));
    }
  }

  return result;
}

/**
 * @internal
 */
function referredLib(name: string): string {
  return name.endsWith('.d.ts') && name.startsWith('lib.') ? name.slice(4, -5) : name;
}

