#include "eyes-triangle-clip.h"
#include <cstdio>
#include <stdexcept>

using eyes::TriangleMesh;
static TriangleMesh rectangle(float x, float y, float w, float h)
{
    return {{{x,y},{x+w,y},{x+w,y+h},{x,y},{x+w,y+h},{x,y+h}}};
}
static double area(const TriangleMesh &mesh, const QMatrix4x4 &m = {})
{
    double sum = 0;
    for (const auto &part : mesh) for (qsizetype i=0;i+2<part.size();i+=3) {
        const auto a=m.map(QVector3D(part[i],0)),b=m.map(QVector3D(part[i+1],0)),c=m.map(QVector3D(part[i+2],0));
        sum += std::abs(double(b.x()-a.x())*(c.y()-a.y())-double(b.y()-a.y())*(c.x()-a.x()))/2;
    }
    return sum;
}
static void expect(double actual, double expected)
{
    if (std::abs(actual-expected)>0.0001) {
        std::fprintf(stderr,"area: %.9f, expected %.9f\n",actual,expected);
        throw std::runtime_error("triangle clipping changed coverage");
    }
}
int main()
{
    try {
        const auto mask=rectangle(-1,-1,2,2), source=rectangle(-4,-4,8,8);
        expect(area(eyes::clipTriangles(source,mask,{})),4);
        expect(area(eyes::clipTriangles(mask,source,{})),4);
        expect(area(eyes::clipTriangles(rectangle(1,-1,2,2),mask,{})),0);
        expect(area(eyes::clipTriangles(rectangle(0,0,2,2),mask,{})),1);
        expect(area(eyes::clipTriangles(source,{},{})),0);
        expect(area(eyes::clipTriangles({},mask,{})),0);
        expect(area(eyes::clipTriangles(source,{{{0,0},{0,0},{0,0}}},{})),0);
        TriangleMesh reversed=mask;
        for(auto &part:reversed)std::reverse(part.begin(),part.end());
        expect(area(eyes::clipTriangles(source,reversed,{})),4);
        for(int angle=0;angle<360;angle+=15) {
            QMatrix4x4 m;m.translate(.1f,-.1f);m.rotate(float(angle),0,0,1);m.scale(2.f,.7f);
            const auto clipped=eyes::clipTriangles(source,mask,m);
            expect(area(clipped,m),4);
            // Output vertices remain in paint space, preserving gradients.
            for(const auto &part:clipped)for(const auto &p:part) {
                const auto world=m.map(QVector3D(p,0));
                if(std::abs(world.x())>1.00001 || std::abs(world.y())>1.00001)
                    throw std::runtime_error("clipped vertex outside mask after paint transform");
            }
        }
        std::puts("Triangle coverage, shared edges, winding and paint transforms passed.");
    } catch(const std::exception &e) { std::fprintf(stderr,"%s\n",e.what());return 1; }
}
