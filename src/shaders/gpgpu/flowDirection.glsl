#ifndef PI
#define PI 3.141592653589793
#endif

uniform vec3 uScreenBoundary;
uniform float uFov;
uniform float uCameraZ;

#include ../includes/uvShift.glsl

const float Z_LIMIT = 4.;

vec2 getViewSizeAtDepth(float depth) {
    float fovInRadians = (uFov * PI) / 180.;
    float height = abs((uCameraZ - depth) * tan(fovInRadians / 2.) * 2.);
    float aspect = resolution.x / resolution.y;
    return vec2(height * aspect, height);
}

void main() {

    ivec2 pixelIndex = ivec2(gl_FragCoord.xy);

    vec3 directionChange = vec3(1.0);//no change by default

    if ((pixelIndex.x + pixelIndex.y * int(resolution.y)) % 3 == 0) {  //flowfield stored once for each of 3 vertexes

        vec2 uv = gl_FragCoord.xy / resolution.xy;

        vec3 flowField = texture2D(uTextureFlowField, getFirstVertexUV(uv, resolution)).xyz;
        vec3 vector = texture2D(uTextureFlowDirection, uv).xyz;

        vec3 boundary;
        boundary.z = uCameraZ / Z_LIMIT;

        for (int i = 0; i < 3; i++) {

            vec2 currentVertexUV = getVertexesUV(uv, resolution, i);

            vec3 position = texture2D(uTexturePosition, currentVertexUV).xyz;
            vec3 currentVertexVector = texture2D(uTextureFlowDirection, currentVertexUV).xyz;

            vec3 newPosition = position + flowField * currentVertexVector;

            // Update the boundaries
            boundary.xy = getViewSizeAtDepth(clamp(newPosition.z, -boundary.z, boundary.z));
            boundary.xy / 1.1; //allow 10% offbounds

            // Check if newPosition will be out of bounds on the x, y and z axes
            if (abs(newPosition.x) > boundary.x || abs(newPosition.y) > boundary.y || abs(newPosition.z) > boundary.z) {

                // flag to reverse if any of three vertexes are offbounds
                if (abs(newPosition.x) > boundary.x)
                    directionChange.x = -1.;
                if (abs(newPosition.y) > boundary.y)
                    directionChange.y = -1.;
                if (abs(newPosition.z) > boundary.z)
                    directionChange.z = -1.;

            }

        }

        // Update the direction vector
        gl_FragColor = vec4(vector * directionChange, 1.);

    } else
        discard;
}