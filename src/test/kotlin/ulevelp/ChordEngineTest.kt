package ulevelp

import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.serialization.json.*
import ulevelp.chord.ChordTheory as CT
import ulevelp.chord.VoicingEngine as GE
import kotlin.test.*

class ChordEngineTest {
    @Test
    fun `Cmaj7 Drop 2 기본형은 1-2-3-4번줄에서 x x 10 12 12 12`() {
        val st = CT.dropStructure("d2").getValue(0)
        val p = CT.placeOn(st, listOf(2, 3, 4, 5), 0, "maj7").first { it.ok }
        assertEquals(listOf(10, 12, 12, 12), p.frets)
    }

    @Test
    fun `같은 자리에서 maj7 에서 7 은 7도 줄만 1프렛 내려간다`() {
        val st = CT.dropStructure("d2").getValue(0)
        val m = CT.mutation("maj7", "7", st, listOf(2, 3, 4, 5))
        assertEquals(1, m.size)
        assertEquals(-1, m[0].delta)
        assertEquals("b7", m[0].to)
    }

    @Test
    fun `2-note-per-string 은 줄마다 정확히 두 음`() {
        val ns = CT.arpeggio2nps(0, 0, 3)
        assertEquals(12, ns.size)
        for (s in 0 until 6) {
            assertEquals(2, ns.count { it.s == s })
        }
        for (i in 1 until ns.size) {
            assertTrue(ns[i].pitch > ns[i - 1].pitch)
        }
    }

    @Test
    fun `F# A C# G# 배열은 Dmaj7(#11), Ebm7(b5), Ab7sus4(b9) 로 해석된다`() {
        val notes = listOf(2 to 4, 3 to 2, 4 to 2, 5 to 4).map { (s, f) ->
            CT.NoteInput(s, f, CT.OPEN[s] + f)
        }
        val names = CT.interpret(notes).map { it.name }
        assertTrue(names.contains("Dmaj7(#11)"))
        assertTrue(names.any { it.startsWith("Ebm7(b5") })
        assertTrue(names.contains("Ab7sus4(b9)"))
    }

    @Test
    fun `5도권 F9 탑 G 는 Bb13, Eb7(3도) 로 이어지고 Ab 칸은 불가`() {
        val st = CT.circleSteps(5, 2)
        assertEquals(listOf("9", "13", "3"), st.take(3).map { it.deg })
        assertNull(st[3].q)
    }

    @Test
    fun `도미넌트 텐션 코드는 그 텐션이 실제로 들어간 폼만 나온다`() {
        val vs = GE.genVoicings(0, "7b9", GE.VoicingOpts(lo = 1, hi = 12))
        assertTrue(vs.isNotEmpty())
        assertTrue(vs.all { v -> v.notes.any { it.deg == "b9" } })
    }

    @Test
    fun `스케일 음이름 도수마다 글자를 하나씩 쓴다`() {
        fun names(r: Int, s: String) = CT.scaleInfo(r, s).notes.joinToString(" ") { it.name }
        assertEquals("C D E G A", names(0, "pentMaj"))
        assertEquals("D E F G A Bb C#", names(2, "harmMinor"))
        assertEquals("Gb Ab Bb Cb Db Eb F", names(6, "major"))
        assertEquals("B C# D# E# F# G# A#", names(11, "lydian"))
    }

    @Test
    fun `5도권 순환 메이저 스케일은 키마다 한 음만 바뀐다`() {
        val ks = CT.scaleCircle(0, "major", 1)
        assertEquals(listOf("C", "G", "D", "A"), ks.take(4).map { it.rootName })
        assertEquals(listOf("F"), ks[1].removed)
        assertEquals(listOf("F#"), ks[1].added)
        ks.forEach { assertEquals(1, it.added.size) }
        assertEquals(listOf("C", "F", "Bb"), CT.scaleCircle(0, "major", -1).take(3).map { it.rootName })
    }

    @Test
    fun `지판 위 스케일 6현 0~12프렛 C 메이저 펜타는 줄마다 5~6개`() {
        val ns = CT.scaleOnBoard(0, "pentMaj", CT.TUNING_BY.getValue("g6").open, 0, 12)
        for (s in 0 until 6) {
            val c = ns.count { it.s == s }
            assertTrue(c in 5..6)
        }
        assertTrue(ns.filter { it.isRoot }.all { CT.pc(it.pitch) == 0 })
    }

    @Test
    fun `스케일 베이스(b4, b5, b6) 튜닝 및 CAGED 5블럭 생성`() {
        val b6 = CT.TUNING_BY.getValue("b6")
        assertEquals("bass", b6.kind)
        assertEquals(listOf(23, 28, 33, 38, 43, 48), b6.open)
        assertEquals(20, b6.frets)

        for (t in listOf("b4", "b5", "b6")) {
            val tuning = CT.TUNING_BY.getValue(t)
            val blks = CT.scaleBlocks(0, "major", tuning.open, tuning.frets)
            assertEquals(5, blks.size)
            assertEquals(listOf("A", "G", "E", "D", "C"), blks.map { it.shape })
            assertTrue(blks.all { it.notes.size >= 10 })
        }
    }

    @Test
    fun `CAGED 5블럭 C Major #1 (A) Shape 루프 시퀀스 (5·3 C to 1·5 A to 6·3 G to 5·3 C)`() {
        val blks = CT.scaleBlocks(0, "major", CT.TUNING_BY.getValue("g6").open, 22)
        val b1 = blks[0]
        assertEquals(1, b1.blockId)
        assertEquals("A", b1.shape)
        assertEquals("#1 Block · (A) Shape", b1.label)
        assertEquals(2, b1.lo)
        assertEquals(6, b1.hi)
        assertEquals(16, b1.notes.size)

        val lowestRoot = b1.notes.first { it.isLowestRoot }
        assertEquals(1, lowestRoot.s) // 5번줄
        assertEquals(3, lowestRoot.f)
        assertEquals(48, lowestRoot.pitch)

        val seq = CT.scaleBlockSeq(b1.notes)
        assertEquals(31, seq.size) // 13 + 15 + 3 = 31

        // 1) 시작: 5번줄 3프렛 C
        assertEquals(1, seq[0].s)
        assertEquals(3, seq[0].f)
        assertEquals(48, seq[0].pitch)
        assertEquals("C", seq[0].name)

        // 2) 13번째 스텝(고음 정점): 1번줄 5프렛 A
        assertEquals(5, seq[12].s)
        assertEquals(5, seq[12].f)
        assertEquals(69, seq[12].pitch)
        assertEquals("A", seq[12].name)

        // 3) 28번째 스텝(저음 정점): 6번줄 3프렛 G
        assertEquals(0, seq[27].s)
        assertEquals(3, seq[27].f)
        assertEquals(43, seq[27].pitch)
        assertEquals("G", seq[27].name)

        // 4) 31번째 스텝(종착): 5번줄 3프렛 C 복귀
        assertEquals(1, seq[30].s)
        assertEquals(3, seq[30].f)
        assertEquals(48, seq[30].pitch)
        assertEquals("C", seq[30].name)
    }

    @Test
    fun `더블 스탑 3도·6도·4도 계산 엔진 검증`() {
        // 3도 (2-1번줄: pair [4, 5])
        val ds3 = CT.doubleStops(0, "major", "3rd", listOf(4, 5), CT.OPEN, 0, 17)
        assertEquals(10, ds3.size)
        assertEquals("C+E", ds3[0].label)
        assertEquals(1, ds3[0].span)
        assertTrue(ds3[0].isRootPair)
        assertTrue(ds3.all {
            val diff = it.notes[1].pitch - it.notes[0].pitch
            diff == 3 || diff == 4
        })

        // 6도 (3-1번줄: pair [3, 5])
        val ds6 = CT.doubleStops(0, "major", "6th", listOf(3, 5), CT.OPEN, 0, 17)
        assertEquals(11, ds6.size)
        assertEquals("G+E", ds6[0].label)
        assertEquals("C+A", ds6[3].label)
        assertTrue(ds6[3].isRootPair)
        assertTrue(ds6.all {
            val diff = it.notes[1].pitch - it.notes[0].pitch
            diff == 8 || diff == 9
        })

        // 4도 (2-1번줄: pair [4, 5])
        val ds4 = CT.doubleStops(0, "major", "4th", listOf(4, 5), CT.OPEN, 0, 17)
        assertEquals(11, ds4.size)
        assertEquals("C+F", ds4[1].label)
        assertTrue(ds4[1].isRootPair)
        assertTrue(ds4.all {
            val diff = it.notes[1].pitch - it.notes[0].pitch
            diff == 5 || diff == 6
        })
    }

    @Test
    fun `Ktor API 엔드포인트 및 정적 파일 서빙 검증`() = testApplication {
        application {
            module(dbConfig = null, authConfig = null)
        }

        // 1. /api/health
        val healthRes = client.get("/api/health")
        assertEquals(HttpStatusCode.OK, healthRes.status)
        assertEquals("nosniff", healthRes.headers["X-Content-Type-Options"])
        val healthJson = Json.parseToJsonElement(healthRes.bodyAsText()).jsonObject
        assertEquals(true, healthJson["ok"]?.jsonPrimitive?.boolean)

        // 2. /api/voicings
        val voicingsRes = client.get("/api/voicings?root=G&quality=13")
        assertEquals(HttpStatusCode.OK, voicingsRes.status)
        val voicingsJson = Json.parseToJsonElement(voicingsRes.bodyAsText()).jsonObject
        assertEquals("G13", voicingsJson["chord"]?.jsonPrimitive?.content)

        // 3. /api/matrix & /api/circle
        val matrixRes = client.get("/api/matrix?root=C&drop=d2&inv=0")
        assertEquals(HttpStatusCode.OK, matrixRes.status)
        val matrixJson = Json.parseToJsonElement(matrixRes.bodyAsText()).jsonArray
        assertEquals(9, matrixJson[0].jsonObject["qualities"]?.jsonArray?.size)

        val circleRes = client.get("/api/circle?root=F&top=2")
        assertEquals(HttpStatusCode.OK, circleRes.status)
        val circleJson = Json.parseToJsonElement(circleRes.bodyAsText()).jsonArray
        assertEquals(12, circleJson.size)

        // 4. /api/two-five-one & /api/top-note
        val tfoRes = client.get("/api/two-five-one?key=C&lo=5&hi=8&pent=A&pentType=min&outside=2")
        assertEquals(HttpStatusCode.OK, tfoRes.status)
        val tfoJson = Json.parseToJsonElement(tfoRes.bodyAsText()).jsonArray
        assertEquals(1, tfoJson.size)
        assertEquals("C", tfoJson[0].jsonObject["key"]?.jsonPrimitive?.content)

        val topRes = client.get("/api/top-note?string=1&fret=8&span=3&notes=4")
        assertEquals(HttpStatusCode.OK, topRes.status)
        val topJson = Json.parseToJsonElement(topRes.bodyAsText()).jsonObject
        assertEquals("C", topJson["top"]?.jsonPrimitive?.content)

        // 5. /api/scale
        val scaleRes = client.get("/api/scale?root=A&type=pentMin&tuning=b4&lo=5&hi=8")
        assertEquals(HttpStatusCode.OK, scaleRes.status)
        val scaleJson = Json.parseToJsonElement(scaleRes.bodyAsText()).jsonObject
        assertEquals("A Pentatonic Minor", scaleJson["name"]?.jsonPrimitive?.content)
        val positions = scaleJson["positions"]!!.jsonArray
        assertTrue(positions.all {
            val obj = it.jsonObject
            val fret = obj["fret"]!!.jsonPrimitive.int
            val str = obj["string"]!!.jsonPrimitive.int
            fret in 5..8 && str in 1..4
        })

        val scaleCircleRes = client.get("/api/scale?root=C&circle=5")
        assertEquals(HttpStatusCode.OK, scaleCircleRes.status)
        assertEquals(12, Json.parseToJsonElement(scaleCircleRes.bodyAsText()).jsonArray.size)

        val badScaleRes = client.get("/api/scale?type=nope")
        assertEquals(HttpStatusCode.BadRequest, badScaleRes.status)
        assertTrue(Json.parseToJsonElement(badScaleRes.bodyAsText()).jsonObject["error"]?.jsonPrimitive?.content?.isNotBlank() == true)

        // 5-1. /api/scale with block=1
        val scaleBlockRes = client.get("/api/scale?root=C&type=major&block=1")
        assertEquals(HttpStatusCode.OK, scaleBlockRes.status)
        val scaleBlockJson = Json.parseToJsonElement(scaleBlockRes.bodyAsText()).jsonObject
        assertEquals("C Major (Ionian)", scaleBlockJson["name"]?.jsonPrimitive?.content)
        val blkObj = scaleBlockJson["block"]!!.jsonObject
        assertEquals(1, blkObj["id"]?.jsonPrimitive?.int)
        assertEquals("A", blkObj["shape"]?.jsonPrimitive?.content)
        assertEquals(2, blkObj["lo"]?.jsonPrimitive?.int)
        assertEquals(6, blkObj["hi"]?.jsonPrimitive?.int)
        assertEquals(16, scaleBlockJson["positions"]?.jsonArray?.size)
        val seqArr = scaleBlockJson["sequence"]!!.jsonArray
        assertEquals(31, seqArr.size)
        assertEquals("C", seqArr[0].jsonObject["note"]?.jsonPrimitive?.content)
        assertEquals(5, seqArr[0].jsonObject["string"]?.jsonPrimitive?.int)

        assertEquals(HttpStatusCode.BadRequest, client.get("/api/scale?block=0").status)
        assertEquals(HttpStatusCode.BadRequest, client.get("/api/scale?block=6").status)

        // 6. /api/interpret
        assertEquals(HttpStatusCode.BadRequest, client.get("/api/interpret?frets=1,2").status)
        val interpRes = client.get("/api/interpret?frets=x,x,4,2,2,4")
        assertEquals(HttpStatusCode.OK, interpRes.status)
        assertTrue(Json.parseToJsonElement(interpRes.bodyAsText()).jsonArray.size >= 4)

        // 7. /api/double-stops
        val dsRes = client.get("/api/double-stops?root=C&type=major&interval=3rd&strings=1-2")
        assertEquals(HttpStatusCode.OK, dsRes.status)
        val dsJson = Json.parseToJsonElement(dsRes.bodyAsText()).jsonArray
        assertEquals(10, dsJson.size)
        val firstDs = dsJson[0].jsonObject
        assertEquals(1, firstDs["step"]?.jsonPrimitive?.int)
        assertEquals("C+E", firstDs["label"]?.jsonPrimitive?.content)
        assertEquals(1, firstDs["span"]?.jsonPrimitive?.int)
        assertEquals(true, firstDs["isRootPair"]?.jsonPrimitive?.boolean)
        val dsNotes = firstDs["notes"]!!.jsonArray
        assertEquals(2, dsNotes.size)
        assertEquals(2, dsNotes[0].jsonObject["string"]?.jsonPrimitive?.int)
        assertEquals(1, dsNotes[1].jsonObject["string"]?.jsonPrimitive?.int)

        assertEquals(HttpStatusCode.BadRequest, client.get("/api/double-stops?interval=invalid").status)
        assertEquals(HttpStatusCode.BadRequest, client.get("/api/double-stops?strings=1-99").status)

        // 8. Unknown /api route -> 404
        val notFoundRes = client.get("/api/not-found")
        assertEquals(HttpStatusCode.NotFound, notFoundRes.status)
        val notFoundJson = Json.parseToJsonElement(notFoundRes.bodyAsText()).jsonObject
        assertEquals("없는 API입니다", notFoundJson["error"]?.jsonPrimitive?.content)
        assertEquals(9, notFoundJson["apis"]?.jsonArray?.size)

        // 9. Static file serving (GET /)
        val indexRes = client.get("/")
        assertEquals(HttpStatusCode.OK, indexRes.status)
        assertTrue(indexRes.bodyAsText().contains("<!doctype html>", ignoreCase = true))
    }

    @Test
    fun `Z1 API 응답 X-Frame-Options DENY 헤더 검증`() = testApplication {
        application {
            module(dbConfig = null, authConfig = null)
        }
        val res = client.get("/api/health")
        assertEquals(HttpStatusCode.OK, res.status)
        assertEquals("DENY", res.headers["X-Frame-Options"])
        assertNull(res.headers["Content-Security-Policy"])
    }

    @Test
    fun `Z2 정적 HTML 서빙 시 Clickjacking 방지 헤더 검증`() = testApplication {
        application {
            module(dbConfig = null, authConfig = null)
        }
        for (path in listOf("/", "/index.html")) {
            val res = client.get(path)
            assertEquals(HttpStatusCode.OK, res.status)
            assertEquals("frame-ancestors 'none'", res.headers["Content-Security-Policy"])
            assertEquals("DENY", res.headers["X-Frame-Options"])
            assertEquals("no-cache", res.headers["Cache-Control"])
        }
    }

    @Test
    fun `Z3 정적 HTML HEAD 응답 Content-Length 단일 헤더 검증`() = testApplication {
        application {
            module(dbConfig = null, authConfig = null)
        }
        val getRes = client.get("/")
        val headRes = client.head("/")
        assertEquals(HttpStatusCode.OK, headRes.status)
        assertEquals(listOf(getRes.bodyAsBytes().size.toString()), headRes.headers.getAll(HttpHeaders.ContentLength))
        assertEquals("frame-ancestors 'none'", headRes.headers["Content-Security-Policy"])
        assertTrue(headRes.bodyAsBytes().isEmpty())
    }
}

