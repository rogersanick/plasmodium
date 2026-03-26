export const DISPLACEMENT_VERTEX = `
uniform sampler2D input_texture;
uniform vec2 resolution;
uniform float maxHeight; // Maximum displacement amount
uniform float inset; // Maximum displacement amount

varying vec2 vUv; 


varying vec3 vNormal;
varying vec3 vPosition;
void main() {
    vUv = uv;
    vNormal = normalMatrix * normal; // Transform the normal to camera space

    //accumulator
    float average = 0.;

    //blur box size. Increase this value to make the displacement smoother. Denotes the range at which neighboring
    //tiles will be sampled. So dim = 1 means 9 sampled pixels. Value of 2 already 25 pixels. Will naturally become
    //less performant the higher you set this.
    const float dim = 3.;
    vec2 texel = 1. / resolution;
    float displacementScale = (1. - inset * 2. );
    
    //weight
    float weight = 1. / pow(dim * 2. + 1., 2.) ;
    
    for( float i = -dim; i <= dim; i++ ){
    
        for( float j = -dim; j <= dim; j++ ){
    
            vec4 pixel = texture2D( input_texture,  uv + vec2(i,j) * texel );
            float val = max(pixel.r,max(pixel.g,pixel.b)) * weight;
            average += displacementScale * val;
    
        }
    }
    vec3 displacedPosition = position + normal * log(1. + average) * maxHeight;
    vec4 newPos = projectionMatrix * modelViewMatrix * vec4(displacedPosition, 1.0);
    vPosition = (modelViewMatrix * vec4(displacedPosition, 1.0)).xyz; // Position in camera space

    gl_Position = newPos;
}
`;
