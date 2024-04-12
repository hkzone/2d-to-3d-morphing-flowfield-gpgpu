#ifndef PI
#define PI 3.141592653589793
#endif

uniform float uTime;
uniform float uFlowFieldInfluence;
uniform float uFlowFieldStrength;
uniform float uFlowFieldFrequency;
uniform float uType;

#include ../includes/simplexNoise4d.glsl

void main() {

    ivec2 pixelIndex = ivec2(gl_FragCoord.xy);

    if ((pixelIndex.x + pixelIndex.y * int(resolution.y)) % 3 == 0) {//calculate flowfield once per 3 vertexes

        float time = uTime * 0.2;
        vec2 uv = gl_FragCoord.xy / resolution.xy;

        vec3 position = texture2D(uTexturePosition, uv).xyz;

        //Strength
        float strength = simplexNoise4d(vec4(position.xyz * 0.2, time + 1.));
        float influence = (uFlowFieldInfluence - 0.5) * (-2.);
        strength = smoothstep(influence, 1., strength);

        //Flow field
        vec3 flowField = vec3(simplexNoise4d((vec4(position.xyz * uFlowFieldFrequency + 0., time))), simplexNoise4d((vec4(position.xyz * uFlowFieldFrequency + 1., time))), simplexNoise4d((vec4(position.xyz * uFlowFieldFrequency + 2., time))));

        //Flowfield style
        if (uType == 1.)
            flowField = vec3(cos(flowField.x * PI), sin(flowField.y * PI), cos(flowField.z * PI));

        flowField = normalize(flowField);
        flowField *= strength * uFlowFieldStrength;

        gl_FragColor = vec4(flowField, 1.0);
    } else {
        discard;
    }
}