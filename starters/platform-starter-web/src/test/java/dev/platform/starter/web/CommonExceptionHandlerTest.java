package dev.platform.starter.web;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class CommonExceptionHandlerTest {
    private final MockMvc mvc = standaloneSetup(new PagedController())
            .setControllerAdvice(new CommonExceptionHandler())
            .build();

    @Test
    void constraintViolationOnQueryParameterBecomesValidationProblemDetail() throws Exception {
        mvc.perform(get("/paged").param("size", "201"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.violations[0].field").value("size"));
    }

    @Test
    void validQueryParameterPassesThrough() throws Exception {
        mvc.perform(get("/paged").param("size", "20"))
                .andExpect(status().isOk());
    }

    @RestController
    static class PagedController {
        @GetMapping("/paged")
        String paged(@RequestParam(name = "size", defaultValue = "50") @Min(1) @Max(200) int size) {
            return "ok";
        }
    }
}
