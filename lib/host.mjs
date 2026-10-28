// src/host.ts
import Schema from "@deepseek-ai/schemastery";
var slotPolicySchema = Schema.object({
  hidden: Schema.dict(Schema.boolean()).default({}),
  order: Schema.dict(Schema.number()).default({}),
  labels: Schema.dict(Schema.string()).default({})
});
var configSchema = Schema.object({
  version: Schema.number().default(1),
  slots: Schema.dict(slotPolicySchema).default({})
});
configSchema.meta.volatile = true;
var Config = configSchema;
var name = "dsh-slots-manager";
function apply(ctx) {
  void ctx;
}
export {
  Config,
  apply,
  name
};
