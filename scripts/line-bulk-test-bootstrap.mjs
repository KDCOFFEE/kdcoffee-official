import './line-card-test-bootstrap.mjs';
import {registerHooks,createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const react=pathToFileURL(createRequire(import.meta.url).resolve('react')).href;
const source=`import React from ${JSON.stringify(react)};export * from ${JSON.stringify(react)};export const useState=(...a)=>globalThis.__bulkHooks?globalThis.__bulkHooks.useState(...a):React.useState(...a);export const useRef=(...a)=>globalThis.__bulkHooks?globalThis.__bulkHooks.useRef(...a):React.useRef(...a);`;
const url='data:text/javascript,'+encodeURIComponent(source);
registerHooks({resolve(specifier,context,next){return specifier==='react'&&context.parentURL?.endsWith('/LineCardBulkModePanel.tsx')?{url,shortCircuit:true}:next(specifier,context);}});
