package dev.platform.sample.item;

import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class ItemControllerContractTest {
    private static final UUID ITEM_ID = UUID.fromString("d55ad19c-d38d-4d10-90b3-c236fd360c42");
    private static final Instant CREATED_AT = Instant.parse("2026-08-16T00:00:00Z");

    private ItemService service;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        service = mock(ItemService.class);
        JsonMapper objectMapper = JsonMapper.builder()
                .addModule(new JavaTimeModule())
                .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
                .build();
        mvc = standaloneSetup(new ItemController(service))
                .setMessageConverters(new MappingJackson2HttpMessageConverter(objectMapper))
                .build();
    }

    @Test
    void listItemsMatchesTheOpenApiSuccessShape() throws Exception {
        when(service.findAll(0, 50)).thenReturn(List.of(new ItemResponse(ITEM_ID, "first-item", CREATED_AT)));

        mvc.perform(get("/api/v1/items"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$[0].id").value(ITEM_ID.toString()))
                .andExpect(jsonPath("$[0].name").value("first-item"))
                .andExpect(jsonPath("$[0].createdAt").value("2026-08-16T00:00:00Z"));
    }

    @Test
    void listItemsForwardsExplicitPageAndSize() throws Exception {
        when(service.findAll(3, 10)).thenReturn(List.of());

        mvc.perform(get("/api/v1/items").param("page", "3").param("size", "10"))
                .andExpect(status().isOk());

        verify(service).findAll(3, 10);
    }

    @Test
    void listItemsRejectsPageSizeAboveTheOpenApiMaximum() throws Exception {
        mvc.perform(get("/api/v1/items").param("size", "201"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void listItemsRejectsNegativePage() throws Exception {
        mvc.perform(get("/api/v1/items").param("page", "-1"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void createItemMatchesTheOpenApiStatusAndSuccessShape() throws Exception {
        when(service.create("new-item")).thenReturn(new ItemResponse(ITEM_ID, "new-item", CREATED_AT));

        mvc.perform(post("/api/v1/items")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"new-item"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.id").value(ITEM_ID.toString()))
                .andExpect(jsonPath("$.name").value("new-item"))
                .andExpect(jsonPath("$.createdAt").value("2026-08-16T00:00:00Z"));

        verify(service).create("new-item");
    }

    @Test
    void createItemRejectsTheOpenApiNameLimit() throws Exception {
        mvc.perform(post("/api/v1/items")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":""}
                                """))
                .andExpect(status().isBadRequest());
    }
}
