/**
 * dsh-slots-manager — host half, TypeScript source.
 *
 * The real work happens in the browser half (src/client.ts): it patches the
 * client slot registry so every registration into a MANAGED slot passes through
 * the manager policy, and contributes the manager's own settings section.
 *
 * This half exists to give the policy somewhere to LIVE. DSH's settings service
 * does not accept arbitrary namespaces — `settings.write()` resolves the
 * namespace by looking the id up among the profile's **configurable plugin
 * entries**:
 *
 *   const entry = configEditor.entries().find((row) => row.options.id === ns)
 *   const schema = entry?.fiber?.runtime?.Config
 *   if (entry === undefined || schema === undefined) throw new Error(`No configurable plugin entry "${ns}"`)
 *
 * So the namespace id must BE this plugin's entry id (`slots-manager`, from
 * cordis.patch.yml), and the schema must be this module's `Config`. Fields
 * marked `meta.volatile` are the ones the settings form may edit — here the
 * whole document, because the plugin's entire config IS the policy.
 *
 * The host deliberately keeps no state: the settings service owns the value,
 * and the browser half reads/writes it over the `remote.settings` wire face.
 *
 * Runtime deps `@deepseek-ai/schemastery` and `@deepseek-ai/cordis` are
 * provided by the DSH runtime (peerDependencies) and resolved at runtime, not
 * bundled into host.mjs.
 */
import Schema from '@deepseek-ai/schemastery'
import type { Context } from '@deepseek-ai/cordis'

/**
 * Policy for ONE slot: entry id → override. The keys are dynamic (any id a
 * plugin registers), so each map is a dict: hidden → boolean, order → number,
 * labels → string.
 */
const slotPolicySchema = Schema.object({
  hidden: Schema.dict(Schema.boolean()).default({}),
  order: Schema.dict(Schema.number()).default({}),
  labels: Schema.dict(Schema.string()).default({}),
})

/**
 * The persisted document, keyed by SLOT first and by entry id inside each slot.
 *
 * That nesting is required, not cosmetic: entry ids are only unique within a
 * slot, and collisions across slots are real — `dsh-client-ui-plugin-manager`
 * contributes the sidebar panel id `plugins`, which is also a settings section
 * id. A flat id map would make hiding one hide the other.
 *
 * `version` is reserved for future shape evolution.
 */
const configSchema = Schema.object({
  version: Schema.number().default(1),
  slots: Schema.dict(slotPolicySchema).default({}),
})

// Mark the whole schema volatile so the settings form may edit every field.
//
// `.volatile()` is NOT used here: it only exists because DSH augments
// schemastery's prototype (`Schema.prototype.volatile = …`), it is absent from
// this package's own typings, and it throws if applied twice. `extra()` — the
// API `.volatile()` itself calls — is typed too narrowly for the key in the
// published schemastery, so the meta is set directly. All three spellings
// produce the same `meta.volatile`, which is the only thing DSH reads.
;(configSchema.meta as unknown as Record<string, unknown>).volatile = true

export const Config = configSchema

export const name = 'dsh-slots-manager'

export function apply(ctx: Context): void {
  // No work to do. Merely being a mounted entry with a `Config` is what makes
  // `slots-manager` a settings namespace; the settings service reads the schema
  // off the loader entry, and the browser half owns every value.
  void ctx
}
