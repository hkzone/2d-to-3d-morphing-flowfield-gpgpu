vec2 getPrevUV(vec2 currentUV, vec2 shift) {
    if (currentUV.x == 0.0) {
        return vec2(1.0 - shift.x, currentUV.y - shift.y);
    } else {
        return currentUV - vec2(shift.x, 0.0);
    }
}

vec2 getNextUV(vec2 currentUV, vec2 shift) {
    if (currentUV.x == resolution.x) {
        return vec2(0., currentUV.y + shift.y);
    } else {
        return currentUV + vec2(shift.x, 0.0);
    }
}

vec2 getFirstVertexUV(vec2 currentUV, vec2 _resolution) {
    vec2 onePixel = 1.0 / _resolution;
    ivec2 pixelIndex = ivec2(gl_FragCoord.xy);
    int index = (pixelIndex.x + pixelIndex.y * int(_resolution.y)) % 3;

    if (index == 0) {
        return currentUV;
    } else if (index == 1) {
        return getPrevUV(currentUV, onePixel);
    } else if (index == 2) {
        return getPrevUV(getPrevUV(currentUV, onePixel), onePixel);
    }

}

vec2 getVertexesUV(vec2 currentUV, vec2 _resolution, int index) {
    vec2 onePixel = 1.0 / _resolution;

    if (index == 0) {
        return currentUV;
    } else if (index == 1) {
        return getNextUV(currentUV, onePixel);
    } else if (index == 2) {
        return getNextUV(getNextUV(currentUV, onePixel), onePixel);
    }

}