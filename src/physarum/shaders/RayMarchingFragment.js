export const RAY_MARCHING_FRAGMENT = `
uniform sampler2D input_texture;
uniform vec2 resolution;
uniform float maxHeight; // Maximum displacement amount
 

varying vec2 vUv; 
 
uniform vec3 cameraPos;

// Function to get ray direction from camera through pixel
vec3 getRayDirection(vec2 uv) {
    vec3 lookAt = vec3(0.0, 0.0, 0.0); // Assuming looking at origin
    float fov = radians(75.0);
    vec3 forward = normalize(lookAt - cameraPos);
    vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(right, forward);
    return normalize(forward + uv.x * right * tan(fov / 2.0) * resolution.x / resolution.y + uv.y * up * tan(fov / 2.0));
}

// Raymarching loop with texture sampling for hits
float raymarch(vec3 ro, vec3 rd) {
    float depth = 0.0;
    for (int i = 0; i < 100; i++) {
        vec3 pos = ro + rd * depth;
        // Map 3D position to 2D texture coordinates
        vec2 uv = pos.xy * 0.5 + 0.5; // Example mapping
        float alpha = texture(input_texture, uv).a;
        if (alpha > 0.5) { // Consider alpha > 0.5 as a hit
            return depth; // Return current depth as hit distance
        }
        depth += 0.05; // Increment depth, adjust step size as needed
        if (depth >= 100.0) break; // Far clip, adjust as needed
    }
    return -1.0; // Return -1 to indicate no hit
}

void main() {
    vec2 uv = vUv;//(gl_FragCoord.xy - 0.5 * resolution.xy) / resolution.y;
    vec3 rd = getRayDirection(uv - 0.5);
    float hitDepth = raymarch(cameraPos, rd);

    if (hitDepth > -1.0) {
        // Hit, map depth to color or use another method to colorize hit
        gl_FragColor = vec4(vec3(hitDepth * 0.1), 1.0); // Example color based on depth
    } else {
        // No hit, background color or transparency
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); // Black background
    }
}
`;
