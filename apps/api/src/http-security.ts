import type { HelmetOptions } from "helmet";

export const apiHelmetOptions: HelmetOptions = {
	contentSecurityPolicy: {
		useDefaults: false,
		directives: {
			defaultSrc: ["'none'"],
			baseUri: ["'none'"],
			formAction: ["'none'"],
			frameAncestors: ["'none'"],
			objectSrc: ["'none'"],
		},
	},
	crossOriginEmbedderPolicy: false,
	crossOriginResourcePolicy: { policy: "cross-origin" },
};
