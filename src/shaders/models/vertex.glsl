uniform float uProgress;
uniform sampler2D uPositionTexture;
uniform sampler2D uFreeFlow;

attribute vec2 aReferenceUv;
attribute vec2 baseUV;
attribute vec2 targetUV;

varying vec2 vUv;
varying float vProgress;

#include ../includes/eases.glsl

void main() {
    vec4 position = texture(uPositionTexture, aReferenceUv);
    vec4 modelPosition = modelMatrix * vec4(position.xyz, 1.0);

    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectedPosition = projectionMatrix * viewPosition;
    gl_Position = projectedPosition;

    // Varyings
    float progress = uProgress;
    if (uProgress > 0.) {
        progress = smoothstep(0.1, 0.9, uProgress);
        progress = qinticOut(progress);
    }

    vUv = mix(baseUV, targetUV, progress);
    vProgress = progress;
}