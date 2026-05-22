import { logoBase64 } from '$lib/assets/logo.base64.ts'

export const getAppIcon = (clipBounds = false): string => `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    ${
		clipBounds
			? `<defs>
                    <clipPath id="bounds">
                        <circle cx="256" cy="256" r="256" />
                    </clipPath>
                </defs>
            `
			: ''
	}
    
    <g ${clipBounds ? 'clip-path="url(#bounds)"' : ''}>
        <image href="data:image/png;base64,${logoBase64}" width="512" height="512" />
    </g>
</svg>
`
