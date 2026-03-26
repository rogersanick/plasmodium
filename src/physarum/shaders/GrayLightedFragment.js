export const GRAY_FRAGMENT = `
uniform sampler2D input_texture; // The input texture
uniform vec3 lightPosition; // Position of the directional light in camera space
uniform vec3 lightColor;
uniform float lightIntensity;


varying vec2 vUv; // The UV coordinate
varying vec3 vNormal;
varying vec3 vPosition;
void main() {
    vec3 normal = normalize(vNormal);
    vec3 lightDir = normalize(lightPosition - vPosition); // Direction from surface point to light
    float diff = max(dot(normal, lightDir), 0.0); // Diffuse light intensity
    vec3 diffuse = diff * lightColor * lightIntensity;

  
    
    vec4 color = texture2D(input_texture, vUv); // Sample the texture at the UV coordinate
    float grayscale = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722)); // Convert to grayscale
    // vec3 baseColor = vec4(vec3(grayscale), color.a).rgb; // Preserve the original alpha
    vec3 baseColor = color.rgb;//vec4(vec3(grayscale), color.a).rgb; // Preserve the original alpha
    
    vec3 finalColor = baseColor * diffuse; // Modulate base color by diffuse light
    gl_FragColor = vec4(finalColor, 1.0);
    
}
`;
