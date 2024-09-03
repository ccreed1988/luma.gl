// luma.gl
// SPDX-License-Identifier: MIT
// Copyright (c) vis.gl contributors

import type {Binding, UniformValue} from '@luma.gl/core';
import {log} from '@luma.gl/core';
// import type {ShaderUniformType, UniformValue, UniformFormat, UniformInfoDevice, Texture, Sampler} from '@luma.gl/core';
import {getShaderModuleDependencies, ShaderModule} from '@luma.gl/shadertools';
import {splitUniformsAndBindings} from './model/split-uniforms-and-bindings';

/**
 * ShaderInputs holds uniform and binding values for one or more shader modules,
 * - It can generate binary data for any uniform buffer
 * - It can manage a uniform buffer for each block
 * - It can update managed uniform buffers with a single call
 * - It performs some book keeping on what has changed to minimize unnecessary writes to uniform buffers.
 */
export class ShaderInputs<
  ShaderPropsT extends Partial<Record<string, Record<string, unknown>>> = Partial<
    Record<string, Record<string, unknown>>
  >
> {
  /**
   * The map of modules
   * @todo should should this include the resolved dependencies?
   */
  modules: Readonly<{[P in keyof ShaderPropsT]: ShaderModule<Record<string, any>>}>;

  /** Stores the uniform values for each module */
  moduleUniforms: Record<keyof ShaderPropsT, Record<string, UniformValue>>;
  /** Stores the uniform bindings for each module  */
  moduleBindings: Record<keyof ShaderPropsT, Record<string, Binding>>;
  /** Tracks if uniforms have changed */
  // moduleUniformsChanged: Record<keyof ShaderPropsT, false | string>;

  /**
   * Create a new UniformStore instance
   * @param modules
   */
  constructor(modules: {[P in keyof ShaderPropsT]?: ShaderModule<Record<string, any>, any>}) {
    // Extract modules with dependencies
    const resolvedModules = getShaderModuleDependencies(
      Object.values(modules).filter(module => module.dependencies)
    );
    for (const resolvedModule of resolvedModules) {
      // @ts-ignore
      modules[resolvedModule.name] = resolvedModule;
    }

    log.log(1, 'Creating ShaderInputs with modules', Object.keys(modules))();

    // Store the module definitions and create storage for uniform values and binding values, per module
    this.modules = modules as {[P in keyof ShaderPropsT]: ShaderModule<Record<string, any>>};
    this.moduleUniforms = {} as Record<keyof ShaderPropsT, Record<string, UniformValue>>;
    this.moduleBindings = {} as Record<keyof ShaderPropsT, Record<string, Binding>>;

    // Initialize the modules
    for (const [name, module] of Object.entries(modules)) {
      this._addModule(module);
      if (module.name && name !== module.name) {
        log.warn(`Module name: ${name} vs ${module.name}`)();
      }
    }
  }

  /** Destroy */
  destroy(): void {}

  /**
   * Set module props
   */
  setProps(props: Partial<{[P in keyof ShaderPropsT]?: Partial<Record<string, any>>}>): void {
    for (const name of Object.keys(props)) {
      const moduleName = name as keyof ShaderPropsT;
      const moduleProps = props[moduleName] || {};
      const module = this.modules[moduleName];
      if (!module) {
        // Ignore props for unregistered modules
        log.warn(`Module ${name} not found`)();
        continue; // eslint-disable-line no-continue
      }

      const oldUniforms = this.moduleUniforms[moduleName] as (typeof module)['uniforms'];
      const oldBindings = this.moduleBindings[moduleName];
      const uniformsAndBindings =
        module.getUniforms?.(moduleProps, oldUniforms) || (moduleProps as any);

      const {uniforms, bindings} = splitUniformsAndBindings(uniformsAndBindings);
      this.moduleUniforms[moduleName] = {...oldUniforms, ...uniforms};
      this.moduleBindings[moduleName] = {...oldBindings, ...bindings};
      // this.moduleUniformsChanged ||= moduleName;

      // console.log(`setProps(${String(moduleName)}`, moduleName, this.moduleUniforms[moduleName])
    }
  }

  /**
   * Return the map of modules
   * @todo should should this include the resolved dependencies?
   */
  getModules(): ShaderModule[] {
    return Object.values(this.modules);
  }

  /** Get all uniform values for all modules */
  getUniformValues(): Partial<Record<keyof ShaderPropsT, Record<string, UniformValue>>> {
    return this.moduleUniforms;
  }

  /** Merges all bindings for the shader (from the various modules) */
  getBindingValues(): Record<string, Binding> {
    const bindings = {} as Record<string, Binding>;
    for (const moduleBindings of Object.values(this.moduleBindings)) {
      Object.assign(bindings, moduleBindings);
    }
    return bindings;
  }

  // INTERNAL

  /** Return a debug table that can be used for console.table() or log.table() */
  getDebugTable(): Record<string, Record<string, unknown>> {
    const table: Record<string, Record<string, unknown>> = {};
    for (const [moduleName, module] of Object.entries(this.moduleUniforms)) {
      for (const [key, value] of Object.entries(module)) {
        table[`${moduleName}.${key}`] = {
          type: this.modules[moduleName].uniformTypes?.[key as keyof ShaderPropsT],
          value: String(value)
        };
      }
    }
    return table;
  }

  _addModule(module: ShaderModule): void {
    const moduleName = module.name as keyof ShaderPropsT;
    // Get default uniforms from module
    this.moduleUniforms[moduleName] = module.defaultUniforms || {};
    this.moduleBindings[moduleName] = {};
  }
}
