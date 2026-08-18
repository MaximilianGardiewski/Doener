import { prepareMcelloGsapVendor } from "../../scripts/vendor-mcello-gsap.mjs";

await prepareMcelloGsapVendor();
await import("./runtime/development.mjs");
