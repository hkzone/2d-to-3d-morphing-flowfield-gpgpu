#ifndef PI
#define PI 3.141592653589793
#endif

uniform float uTime;
uniform float uDeltaTime;
uniform float uProgress;
uniform sampler2D uBase;
uniform sampler2D uTargetPosition;
uniform float uFreeFlow;

#include ../includes/eases.glsl
#include ../includes/uvShift.glsl

float map(float value, float min1, float max1, float min2, float max2) {
    return min2 + (value - min1) * (max2 - min2) / (max1 - min1);
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;

    vec3 position = texture2D(uTexturePosition, uv).xyz;

    vec3 finalPosition = position;

    float control = step(0.001, uProgress);

    vec3 flowField;
    if (control != 0. || uFreeFlow == 1.) {
        vec2 vertUV = getFirstVertexUV(uv, resolution);
        vec3 flowField = texture2D(uTextureFlowField, vertUV).xyz;
        vec3 flowFirection = texture2D(uTextureFlowDirection, vertUV).xyz;
        vec3 targetPosition = texture2D(uTargetPosition, uv).xyz;
        vec3 base = texture(uBase, uv).xyz;

        vec3 straightPosition = mix(base, targetPosition, uProgress);
        vec3 dir = position - targetPosition;
        float dist = length(dir);
        float initialDist = length(base - targetPosition);

        float distanceStrength = dist / initialDist;
        float distanceDeviation = length(straightPosition - position);
        float progress = map(uProgress, 0., 1., 0.5, 5.);
        progress += smoothstep(0.9, 1., uProgress) * 5.;

        vec3 velocity;
        if (uFreeFlow == 0.)
            velocity = flowField * flowFirection * 0.5 * smoothstep(0., 0.5, 1. - uProgress) - dir * normalize(distanceDeviation) * uDeltaTime * progress;
        else
            velocity = flowField * 0.5 * flowFirection;

        finalPosition += velocity;
    }

    gl_FragColor = vec4(finalPosition, 1.);

}