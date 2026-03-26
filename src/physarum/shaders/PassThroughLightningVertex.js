export const PASS_THROUGH_LIGHT_VERTEX = `

varying vec2 vUv; 
varying vec3 vNormal;
varying vec3 vPosition;
void main(){
    vUv = uv; 
    vNormal = normalMatrix * normal; // Transform the normal to camera space
    vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz; // Position in camera space
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.);
}
 `;
