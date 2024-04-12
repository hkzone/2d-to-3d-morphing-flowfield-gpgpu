varying vec3 vColor;
varying vec2 vUv;

varying float vProgress;
uniform sampler2D tMap;
uniform sampler2D tMap1;

void main() {
    vec2 uv = vUv;

    vec4 color = texture2D(tMap, uv);
    vec4 targetColor = texture2D(tMap1, uv);

    vec4 finalColor = mix(color, targetColor, vProgress);

    gl_FragColor = finalColor;

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}