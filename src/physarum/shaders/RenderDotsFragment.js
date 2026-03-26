export const RENDER_DOTS_FRAGMENT = `
uniform sampler2D particleTexture;
uniform bool isParticleTexture;
varying float team;
void main(){
    float r = 0.;
    float g = 0.;
    float b = 1.;
    if (team == 0.) {
        r = 1.;
        g= 0.;
        b = 0.;
    } else if (team == 1. ) {
        r = 0.;
        g = 1.;
        b = 0.;
    }
    if (isParticleTexture){
        gl_FragColor =  vec4( r,g, b ,1.) * texture2D(particleTexture,gl_PointCoord);
    } else {
        gl_FragColor =  vec4( r,g, b ,1.) ;//* texture2D(particleTexture,gl_PointCoord);
    }
}
`;
